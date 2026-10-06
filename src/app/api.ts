import { createApi } from '../api';

/** The app's single API instance. Tests build their own with createApi(). */
export const api = createApi({ baseUrl: '', storage: window.localStorage });
