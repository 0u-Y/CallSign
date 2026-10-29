export const publicPreview = import.meta.env.VITE_PUBLIC_PREVIEW === "true";

export const finalsProfile = import.meta.env.VITE_PROTOCOL_PROFILE === "finals";

export const serviceProfile = !publicPreview && (!import.meta.env.VITE_PROTOCOL_PROFILE || import.meta.env.VITE_PROTOCOL_PROFILE === "service");
