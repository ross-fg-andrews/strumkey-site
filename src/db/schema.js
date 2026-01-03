import { init } from '@instantdb/react';
import schema from '../instant.schema';

// TODO: Replace with your InstantDB App ID from dashboard
const APP_ID = import.meta.env.VITE_INSTANTDB_APP_ID || 'YOUR_APP_ID';

export const db = init({ appId: APP_ID, schema });
