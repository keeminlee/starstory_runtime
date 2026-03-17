export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";

export const DISPLAY_APP_VERSION =
	APP_VERSION === "dev" || APP_VERSION.startsWith("v") ? APP_VERSION : `v${APP_VERSION}`;
