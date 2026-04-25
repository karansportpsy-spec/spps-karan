import dotenv from 'dotenv';

dotenv.config();

const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL'];
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`[SPPS API] Missing required environment variable: ${key}`);
  }
}

export const env = {
  port: Number(process.env.PORT || 4000),
  apiBasePath: process.env.API_BASE_PATH || '/api',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  platformCountry: process.env.PLATFORM_COUNTRY || 'IN',
  platformCurrency: process.env.PLATFORM_CURRENCY || 'INR',
  databaseUrl: process.env.DATABASE_URL,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || '',
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  sessionTokenCost: Number(process.env.SESSION_TOKEN_COST || 10),
  messageTokenCost: Number(process.env.MESSAGE_TOKEN_COST || 1),
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpSecure: String(process.env.SMTP_SECURE || 'false') === 'true',
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  smtpFrom: process.env.SMTP_FROM || 'SPPS <no-reply@spps.local>',
  enableActivationEmail: String(process.env.ENABLE_ACTIVATION_EMAIL || 'true') === 'true',
  clinicalAccessPasswordHash: process.env.CLINICAL_ACCESS_PASSWORD_HASH || '',
  clinicalAccessTokenSecret: process.env.CLINICAL_ACCESS_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY,
  clinicalAuditSalt: process.env.CLINICAL_AUDIT_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY,
  clinicalAccessSessionMinutes: Number(process.env.CLINICAL_ACCESS_SESSION_MINUTES || 20),
  clinicalAccessWindowMinutes: Number(process.env.CLINICAL_ACCESS_WINDOW_MINUTES || 15),
  clinicalAccessMaxAttempts: Number(process.env.CLINICAL_ACCESS_MAX_ATTEMPTS || 5),
};
