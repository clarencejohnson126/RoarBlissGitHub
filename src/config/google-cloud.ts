import { env } from './env';

// Google Cloud configuration
export const googleCloudConfig = {
  projectId: 'googel-translate-445420',
  apiKey: 'f7f920bbeabbe4b809f639c4aa7a5d68402d4cf6',
  credentials: {
    type: 'service_account',
    project_id: 'googel-translate-445420',
    private_key_id: 'f7f920bbeabbe4b809f639c4aa7a5d68402d4cf6',
    private_key: env.GOOGLE_CLOUD_PRIVATE_KEY,
    client_email: 'bolt-526@googel-translate-445420.iam.gserviceaccount.com',
    client_id: '103419692631420493553',
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token',
    auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
    client_x509_cert_url: 'https://www.googleapis.com/robot/v1/metadata/x509/bolt-526%40googel-translate-445420.iam.gserviceaccount.com'
  }
};