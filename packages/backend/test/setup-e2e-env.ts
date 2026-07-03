import './setup-env';

process.env.DATABASE_URL ||= 'postgresql://nongchang:nongchang@127.0.0.1:5544/nongchang?schema=public';
