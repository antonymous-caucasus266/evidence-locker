-- Initialize the evidence_locker database
CREATE DATABASE IF NOT EXISTS evidence_locker;

-- Create user if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'evidence_locker') THEN
        CREATE ROLE evidence_locker LOGIN PASSWORD 'evidence_locker_password';
    END IF;
END
$$;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE evidence_locker TO evidence_locker;
GRANT ALL PRIVILEGES ON SCHEMA public TO evidence_locker;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO evidence_locker;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO evidence_locker;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO evidence_locker;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO evidence_locker;
