-- iBloomCRM v2 Foundation Migration
-- File: 20260723_001_foundation.sql

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tenants Table (Spine of Multi-Tenancy)
CREATE TABLE IF NOT EXISTS public.tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- active, suspended, provisioning, archived, pending
    is_master_agency BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Users Table
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'tenant_user', -- super_admin, platform_staff, tenant_admin, tenant_user
    mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. User Tenants Junction (Multi-membership support)
CREATE TABLE IF NOT EXISTS public.user_tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'member', -- owner, admin, agent
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, tenant_id)
);

-- 4. Tenant Secrets Table (Vault-backed isolation)
CREATE TABLE IF NOT EXISTS public.tenant_secrets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    secret_key VARCHAR(100) NOT NULL,
    encrypted_value TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, secret_key)
);

-- Seed Tenant Zero (Master Agency) and Super Admin
INSERT INTO public.tenants (id, name, slug, status, is_master_agency)
VALUES (
    '00000000-0000-0000-0000-000000000000',
    'iBloom Master Agency (Tenant Zero)',
    'ibloom-master',
    'active',
    TRUE
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, full_name, role, mfa_enabled)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    'crm@ibloomsolutions.com',
    'Master Super Admin',
    'super_admin',
    TRUE
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_tenants (user_id, tenant_id, role, is_default)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    '00000000-0000-0000-0000-000000000000',
    'owner',
    TRUE
) ON CONFLICT (user_id, tenant_id) DO NOTHING;

-- RLS Policies Setup
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_secrets ENABLE ROW LEVEL SECURITY;
