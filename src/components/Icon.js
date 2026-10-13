export default function Icon({ name, size = 20, className = '', ...props }) {
  const paths = {
    arrowRight: <><path d="M5 12h14M12 5l7 7-7 7" /></>,
    arrowUpRight: <><path d="M7 17 17 7M7 7h10v10" /></>,
    arrowLeft: <><path d="M19 12H5m7 7-7-7 7-7" /></>,
    chevronDown: <path d="m6 9 6 6 6-6" />,
    chevronLeft: <path d="m15 6-6 6 6 6" />,
    chevronRight: <path d="m9 6 6 6-6 6" />,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></>,
    pin: <><path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M16 3v4M8 3v4M3 11h18m-13 4h2m4 0h2m-8 3h2" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    camera: <><path d="M8 6 10 3h4l2 3h4a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" /><circle cx="12" cy="13" r="4" /></>,
    film: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 3v18M17 3v18M3 8h4m-4 8h4m10-8h4m-4 8h4M7 12h10" /></>,
    video: <><rect x="2" y="6" width="13" height="13" rx="3" /><path d="m15 10 7-4v13l-7-4" /></>,
    drone: <><rect x="9" y="9" width="6" height="6" rx="2" /><path d="m9 9-3-3m9 3 3-3m-9 9-3 3m9-3 3 3" /><ellipse cx="5" cy="5" rx="3" ry="2" /><ellipse cx="19" cy="5" rx="3" ry="2" /><ellipse cx="5" cy="19" rx="3" ry="2" /><ellipse cx="19" cy="19" rx="3" ry="2" /></>,
    gimbal: <><rect x="6" y="3" width="12" height="8" rx="2" /><circle cx="12" cy="7" r="2" /><path d="M3 7v7a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V7M12 17v5m-3 0h6" /></>,
    sliders: <><path d="M4 7h7m4 0h5M4 17h3m4 0h9" /><circle cx="13" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>,
    heart: <path d="M20.8 4.7a5.5 5.5 0 0 0-7.8 0L12 5.8l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.5a5.5 5.5 0 0 0 0-7.8Z" />,
    star: <path d="m12 3 2.8 5.7 6.3.9-4.5 4.4 1 6.2-5.6-3-5.6 3 1-6.2L3 9.6l6.2-.9Z" />,
    check: <path d="m5 12 4 4L19 6" />,
    verified: <><path d="m12 2 3 2 3.6.4.7 3.6L22 11l-1.5 3.4-.4 3.6-3.6.7L13 22l-3.4-1.5-3.6-.4-.7-3.6L2 13l1.5-3.4.4-3.6 3.6-.7Z" /><path d="m8 12 3 3 5-6" /></>,
    bolt: <path d="m13 2-9 12h7l-1 8 10-12h-7l1-8Z" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    edit: <><path d="m15 5 4 4M4 20l4-1 12-12a2.8 2.8 0 0 0-4-4L4 15l-1 6Z" /><path d="M12 21h9" /></>,
    message: <><path d="M21 11.5a8.5 8.5 0 0 1-9 8.5 10 10 0 0 1-4-.8L3 21l1.6-5a8 8 0 0 1-1.6-4.5A8.5 8.5 0 0 1 12 3a8.5 8.5 0 0 1 9 8.5Z" /><path d="M8 11h8m-8 4h5" /></>,
    send: <><path d="m22 2-7 20-4-9L2 9 22 2Z" /><path d="m22 2-11 11" /></>,
    briefcase: <><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3M3 12a24 24 0 0 0 18 0m-9 0v3" /></>,
    aperture: <><circle cx="12" cy="12" r="9" /><path d="m14.5 3.4 4 7M21 12l-8 0M16.5 19.8l-4-7m-5 7.8 4-7M3 12h8M7.5 4.2l4 7" /></>,
    globe: <><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18" /></>,
    shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" /><path d="m8 12 3 3 5-6" /></>,
    users: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v2" /></>,
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    sparkles: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" /><path d="M20 2v4m-2-2h4" /></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 7a7 7 0 0 1 11.6-2L20 8M4 16l2.3 3A7 7 0 0 0 18 17" /></>,
    logOut: <><path d="M9 5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4M9 12h12m-4-4 4 4-4 4" /></>,
    link: <><path d="m10 13 4-4M8 15l-1 1a4.2 4.2 0 0 1-6-6l4-4a4.2 4.2 0 0 1 6 0m2 3 1-1a4.2 4.2 0 0 1 6 6l-4 4a4.2 4.2 0 0 1-6 0" transform="translate(1 1)" /></>,
    folder: <path d="M3 7V5a2 2 0 0 1 2-2h5l3 4h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />,
    upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" /></>,
    file: <><path d="M14 2H5a1 1 0 0 0-1 1v18a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V8l-6-6Zm0 0v6h6M8 13h8m-8 4h6" /></>,
    trash: <><path d="M3 6h18m-13 0V3h8v3M5 6l1 15h12l1-15M10 10v7m4-7v7" /></>,
  };

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={`icon ${className}`} aria-hidden="true" {...props}>
      {paths[name] || paths.camera}
    </svg>
  );
}
