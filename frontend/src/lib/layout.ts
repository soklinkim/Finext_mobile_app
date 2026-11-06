/** The app is a phone-width column (see app/_layout.tsx). Popups open outside that column on the web, so they keep the same width. */
export const APP_MAX_WIDTH = 430;

/** For the panel of a bottom sheet: full width on a phone, the app's width and centred on a wide screen. */
export const sheetPanel = { width: '100%', maxWidth: APP_MAX_WIDTH, alignSelf: 'center' } as const;

/** For a card shown in the middle of the screen. */
export const popupCard = { maxWidth: APP_MAX_WIDTH - 48 } as const;
