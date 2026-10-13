const { GridFSBucket } = require('mongodb');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function filenameHeader(name) {
  return `inline; filename*=UTF-8''${encodeURIComponent(name).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}

function createMongoAssetStore(db) {
  const bucket = new GridFSBucket(db, { bucketName: 'portfolioAssets' });
  const files = db.collection('portfolioAssets.files');

  async function fileForAsset(id) {
    return files.findOne({ 'metadata.assetId': id });
  }

  return {
    async save(id, source, metadata, maxBytes) {
      let size = 0;
      let tooLarge = false;
      const upload = bucket.openUploadStream(id, {
        metadata: { assetId: id, name: metadata.name, type: metadata.type },
      });

      async function* limitedChunks() {
        for await (const chunk of source) {
          if (tooLarge) continue;
          size += chunk.length;
          if (size > maxBytes) {
            tooLarge = true;
            continue;
          }
          yield chunk;
        }
        if (tooLarge) throw httpError(413, 'Each project file must be 50 MB or smaller. Use a Google Drive link for larger files.');
        if (!size) throw httpError(400, 'Choose a non-empty project file.');
      }

      try {
        await pipeline(Readable.from(limitedChunks()), upload);
      } catch (error) {
        try { await bucket.delete(upload.id); } catch { /* An incomplete upload may not have a files record yet. */ }
        throw error;
      }
      return { size };
    },

    async remove(id) {
      const file = await fileForAsset(id);
      if (file) await bucket.delete(file._id);
    },

    async has(id) {
      return Boolean(await fileForAsset(id));
    },

    async send(request, response, asset) {
      const file = await fileForAsset(asset.id);
      if (!file) throw httpError(404, 'Project file not found.');
      const size = file.length;
      const headers = {
        'Content-Type': asset.type,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': filenameHeader(asset.name),
        'Accept-Ranges': 'bytes',
      };
      let start = 0;
      let end = size - 1;
      let status = 200;
      if (request.headers.range) {
        const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
        if (!range || (!range[1] && !range[2])) {
          response.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}` });
          response.end();
          return;
        }
        if (range[1]) {
          start = Number(range[1]);
          end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
        } else {
          start = Math.max(0, size - Number(range[2]));
        }
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
          response.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}` });
          response.end();
          return;
        }
        status = 206;
        headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
      }
      response.writeHead(status, { ...headers, 'Content-Length': end - start + 1 });
      if (request.method === 'HEAD') {
        response.end();
        return;
      }
      const stream = bucket.openDownloadStream(file._id, { start, end: end + 1 });
      stream.on('error', () => response.destroy());
      stream.pipe(response);
    },
  };
}

module.exports = { createMongoAssetStore };
