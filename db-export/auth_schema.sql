--
-- PostgreSQL database dump
--

-- Dumped from database version 15.8
-- Dumped by pg_dump version 15.8

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: auth; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA auth;


--
-- Name: aal_level; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.aal_level AS ENUM (
    'aal1',
    'aal2',
    'aal3'
);


--
-- Name: code_challenge_method; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.code_challenge_method AS ENUM (
    's256',
    'plain'
);


--
-- Name: factor_status; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.factor_status AS ENUM (
    'unverified',
    'verified'
);


--
-- Name: factor_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.factor_type AS ENUM (
    'totp',
    'webauthn',
    'phone'
);


--
-- Name: oauth_authorization_status; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_authorization_status AS ENUM (
    'pending',
    'approved',
    'denied',
    'expired'
);


--
-- Name: oauth_client_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_client_type AS ENUM (
    'public',
    'confidential'
);


--
-- Name: oauth_registration_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_registration_type AS ENUM (
    'dynamic',
    'manual'
);


--
-- Name: oauth_response_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_response_type AS ENUM (
    'code'
);


--
-- Name: one_time_token_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.one_time_token_type AS ENUM (
    'confirmation_token',
    'reauthentication_token',
    'recovery_token',
    'email_change_token_new',
    'email_change_token_current',
    'phone_change_token'
);


--
-- Name: email(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.email() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$$;


--
-- Name: FUNCTION email(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.email() IS 'Deprecated. Use auth.jwt() -> ''email'' instead.';


--
-- Name: jwt(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.jwt() RETURNS jsonb
    LANGUAGE sql STABLE
    AS $$
  select 
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$$;


--
-- Name: role(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.role() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;


--
-- Name: FUNCTION role(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.role() IS 'Deprecated. Use auth.jwt() -> ''role'' instead.';


--
-- Name: uid(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;


--
-- Name: FUNCTION uid(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.uid() IS 'Deprecated. Use auth.jwt() -> ''sub'' instead.';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_log_entries; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.audit_log_entries (
    instance_id uuid,
    id uuid NOT NULL,
    payload json,
    created_at timestamp with time zone,
    ip_address character varying(64) DEFAULT ''::character varying NOT NULL
);


--
-- Name: TABLE audit_log_entries; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.audit_log_entries IS 'Auth: Audit trail for user actions.';


--
-- Name: custom_oauth_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.custom_oauth_providers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_type text NOT NULL,
    identifier text NOT NULL,
    name text NOT NULL,
    client_id text NOT NULL,
    client_secret text NOT NULL,
    acceptable_client_ids text[] DEFAULT '{}'::text[] NOT NULL,
    scopes text[] DEFAULT '{}'::text[] NOT NULL,
    pkce_enabled boolean DEFAULT true NOT NULL,
    attribute_mapping jsonb DEFAULT '{}'::jsonb NOT NULL,
    authorization_params jsonb DEFAULT '{}'::jsonb NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    email_optional boolean DEFAULT false NOT NULL,
    issuer text,
    discovery_url text,
    skip_nonce_check boolean DEFAULT false NOT NULL,
    cached_discovery jsonb,
    discovery_cached_at timestamp with time zone,
    authorization_url text,
    token_url text,
    userinfo_url text,
    jwks_uri text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT custom_oauth_providers_authorization_url_https CHECK (((authorization_url IS NULL) OR (authorization_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_authorization_url_length CHECK (((authorization_url IS NULL) OR (char_length(authorization_url) <= 2048))),
    CONSTRAINT custom_oauth_providers_client_id_length CHECK (((char_length(client_id) >= 1) AND (char_length(client_id) <= 512))),
    CONSTRAINT custom_oauth_providers_discovery_url_length CHECK (((discovery_url IS NULL) OR (char_length(discovery_url) <= 2048))),
    CONSTRAINT custom_oauth_providers_identifier_format CHECK ((identifier ~ '^[a-z0-9][a-z0-9:-]{0,48}[a-z0-9]$'::text)),
    CONSTRAINT custom_oauth_providers_issuer_length CHECK (((issuer IS NULL) OR ((char_length(issuer) >= 1) AND (char_length(issuer) <= 2048)))),
    CONSTRAINT custom_oauth_providers_jwks_uri_https CHECK (((jwks_uri IS NULL) OR (jwks_uri ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_jwks_uri_length CHECK (((jwks_uri IS NULL) OR (char_length(jwks_uri) <= 2048))),
    CONSTRAINT custom_oauth_providers_name_length CHECK (((char_length(name) >= 1) AND (char_length(name) <= 100))),
    CONSTRAINT custom_oauth_providers_oauth2_requires_endpoints CHECK (((provider_type <> 'oauth2'::text) OR ((authorization_url IS NOT NULL) AND (token_url IS NOT NULL) AND (userinfo_url IS NOT NULL)))),
    CONSTRAINT custom_oauth_providers_oidc_discovery_url_https CHECK (((provider_type <> 'oidc'::text) OR (discovery_url IS NULL) OR (discovery_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_oidc_issuer_https CHECK (((provider_type <> 'oidc'::text) OR (issuer IS NULL) OR (issuer ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_oidc_requires_issuer CHECK (((provider_type <> 'oidc'::text) OR (issuer IS NOT NULL))),
    CONSTRAINT custom_oauth_providers_provider_type_check CHECK ((provider_type = ANY (ARRAY['oauth2'::text, 'oidc'::text]))),
    CONSTRAINT custom_oauth_providers_token_url_https CHECK (((token_url IS NULL) OR (token_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_token_url_length CHECK (((token_url IS NULL) OR (char_length(token_url) <= 2048))),
    CONSTRAINT custom_oauth_providers_userinfo_url_https CHECK (((userinfo_url IS NULL) OR (userinfo_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_userinfo_url_length CHECK (((userinfo_url IS NULL) OR (char_length(userinfo_url) <= 2048)))
);


--
-- Name: flow_state; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.flow_state (
    id uuid NOT NULL,
    user_id uuid,
    auth_code text,
    code_challenge_method auth.code_challenge_method,
    code_challenge text,
    provider_type text NOT NULL,
    provider_access_token text,
    provider_refresh_token text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    authentication_method text NOT NULL,
    auth_code_issued_at timestamp with time zone,
    invite_token text,
    referrer text,
    oauth_client_state_id uuid,
    linking_target_id uuid,
    email_optional boolean DEFAULT false NOT NULL
);


--
-- Name: TABLE flow_state; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.flow_state IS 'Stores metadata for all OAuth/SSO login flows';


--
-- Name: identities; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.identities (
    provider_id text NOT NULL,
    user_id uuid NOT NULL,
    identity_data jsonb NOT NULL,
    provider text NOT NULL,
    last_sign_in_at timestamp with time zone,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    email text GENERATED ALWAYS AS (lower((identity_data ->> 'email'::text))) STORED,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: TABLE identities; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.identities IS 'Auth: Stores identities associated to a user.';


--
-- Name: COLUMN identities.email; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.identities.email IS 'Auth: Email is a generated column that references the optional email property in the identity_data';


--
-- Name: instances; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.instances (
    id uuid NOT NULL,
    uuid uuid,
    raw_base_config text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);


--
-- Name: TABLE instances; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.instances IS 'Auth: Manages users across multiple sites.';


--
-- Name: mfa_amr_claims; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_amr_claims (
    session_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    authentication_method text NOT NULL,
    id uuid NOT NULL
);


--
-- Name: TABLE mfa_amr_claims; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_amr_claims IS 'auth: stores authenticator method reference claims for multi factor authentication';


--
-- Name: mfa_challenges; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_challenges (
    id uuid NOT NULL,
    factor_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    verified_at timestamp with time zone,
    ip_address inet NOT NULL,
    otp_code text,
    web_authn_session_data jsonb
);


--
-- Name: TABLE mfa_challenges; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_challenges IS 'auth: stores metadata about challenge requests made';


--
-- Name: mfa_factors; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_factors (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    friendly_name text,
    factor_type auth.factor_type NOT NULL,
    status auth.factor_status NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    secret text,
    phone text,
    last_challenged_at timestamp with time zone,
    web_authn_credential jsonb,
    web_authn_aaguid uuid,
    last_webauthn_challenge_data jsonb
);


--
-- Name: TABLE mfa_factors; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_factors IS 'auth: stores metadata about factors';


--
-- Name: COLUMN mfa_factors.last_webauthn_challenge_data; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.mfa_factors.last_webauthn_challenge_data IS 'Stores the latest WebAuthn challenge data including attestation/assertion for customer verification';


--
-- Name: oauth_authorizations; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_authorizations (
    id uuid NOT NULL,
    authorization_id text NOT NULL,
    client_id uuid NOT NULL,
    user_id uuid,
    redirect_uri text NOT NULL,
    scope text NOT NULL,
    state text,
    resource text,
    code_challenge text,
    code_challenge_method auth.code_challenge_method,
    response_type auth.oauth_response_type DEFAULT 'code'::auth.oauth_response_type NOT NULL,
    status auth.oauth_authorization_status DEFAULT 'pending'::auth.oauth_authorization_status NOT NULL,
    authorization_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:03:00'::interval) NOT NULL,
    approved_at timestamp with time zone,
    nonce text,
    CONSTRAINT oauth_authorizations_authorization_code_length CHECK ((char_length(authorization_code) <= 255)),
    CONSTRAINT oauth_authorizations_code_challenge_length CHECK ((char_length(code_challenge) <= 128)),
    CONSTRAINT oauth_authorizations_expires_at_future CHECK ((expires_at > created_at)),
    CONSTRAINT oauth_authorizations_nonce_length CHECK ((char_length(nonce) <= 255)),
    CONSTRAINT oauth_authorizations_redirect_uri_length CHECK ((char_length(redirect_uri) <= 2048)),
    CONSTRAINT oauth_authorizations_resource_length CHECK ((char_length(resource) <= 2048)),
    CONSTRAINT oauth_authorizations_scope_length CHECK ((char_length(scope) <= 4096)),
    CONSTRAINT oauth_authorizations_state_length CHECK ((char_length(state) <= 4096))
);


--
-- Name: oauth_client_states; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_client_states (
    id uuid NOT NULL,
    provider_type text NOT NULL,
    code_verifier text,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: TABLE oauth_client_states; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.oauth_client_states IS 'Stores OAuth states for third-party provider authentication flows where Supabase acts as the OAuth client.';


--
-- Name: oauth_clients; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_clients (
    id uuid NOT NULL,
    client_secret_hash text,
    registration_type auth.oauth_registration_type NOT NULL,
    redirect_uris text NOT NULL,
    grant_types text NOT NULL,
    client_name text,
    client_uri text,
    logo_uri text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    client_type auth.oauth_client_type DEFAULT 'confidential'::auth.oauth_client_type NOT NULL,
    token_endpoint_auth_method text NOT NULL,
    CONSTRAINT oauth_clients_client_name_length CHECK ((char_length(client_name) <= 1024)),
    CONSTRAINT oauth_clients_client_uri_length CHECK ((char_length(client_uri) <= 2048)),
    CONSTRAINT oauth_clients_logo_uri_length CHECK ((char_length(logo_uri) <= 2048)),
    CONSTRAINT oauth_clients_token_endpoint_auth_method_check CHECK ((token_endpoint_auth_method = ANY (ARRAY['client_secret_basic'::text, 'client_secret_post'::text, 'none'::text])))
);


--
-- Name: oauth_consents; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_consents (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    client_id uuid NOT NULL,
    scopes text NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    CONSTRAINT oauth_consents_revoked_after_granted CHECK (((revoked_at IS NULL) OR (revoked_at >= granted_at))),
    CONSTRAINT oauth_consents_scopes_length CHECK ((char_length(scopes) <= 2048)),
    CONSTRAINT oauth_consents_scopes_not_empty CHECK ((char_length(TRIM(BOTH FROM scopes)) > 0))
);


--
-- Name: one_time_tokens; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.one_time_tokens (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    token_type auth.one_time_token_type NOT NULL,
    token_hash text NOT NULL,
    relates_to text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT one_time_tokens_token_hash_check CHECK ((char_length(token_hash) > 0))
);


--
-- Name: refresh_tokens; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.refresh_tokens (
    instance_id uuid,
    id bigint NOT NULL,
    token character varying(255),
    user_id character varying(255),
    revoked boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    parent character varying(255),
    session_id uuid
);


--
-- Name: TABLE refresh_tokens; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.refresh_tokens IS 'Auth: Store of tokens used to refresh JWT tokens once they expire.';


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE; Schema: auth; Owner: -
--

CREATE SEQUENCE auth.refresh_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: auth; Owner: -
--

ALTER SEQUENCE auth.refresh_tokens_id_seq OWNED BY auth.refresh_tokens.id;


--
-- Name: saml_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.saml_providers (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    entity_id text NOT NULL,
    metadata_xml text NOT NULL,
    metadata_url text,
    attribute_mapping jsonb,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    name_id_format text,
    CONSTRAINT "entity_id not empty" CHECK ((char_length(entity_id) > 0)),
    CONSTRAINT "metadata_url not empty" CHECK (((metadata_url = NULL::text) OR (char_length(metadata_url) > 0))),
    CONSTRAINT "metadata_xml not empty" CHECK ((char_length(metadata_xml) > 0))
);


--
-- Name: TABLE saml_providers; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.saml_providers IS 'Auth: Manages SAML Identity Provider connections.';


--
-- Name: saml_relay_states; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.saml_relay_states (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    request_id text NOT NULL,
    for_email text,
    redirect_to text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    flow_state_id uuid,
    CONSTRAINT "request_id not empty" CHECK ((char_length(request_id) > 0))
);


--
-- Name: TABLE saml_relay_states; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.saml_relay_states IS 'Auth: Contains SAML Relay State information for each Service Provider initiated login.';


--
-- Name: schema_migrations; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.schema_migrations (
    version character varying(255) NOT NULL
);


--
-- Name: TABLE schema_migrations; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.schema_migrations IS 'Auth: Manages updates to the auth system.';


--
-- Name: sessions; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sessions (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    factor_id uuid,
    aal auth.aal_level,
    not_after timestamp with time zone,
    refreshed_at timestamp without time zone,
    user_agent text,
    ip inet,
    tag text,
    oauth_client_id uuid,
    refresh_token_hmac_key text,
    refresh_token_counter bigint,
    scopes text,
    CONSTRAINT sessions_scopes_length CHECK ((char_length(scopes) <= 4096))
);


--
-- Name: TABLE sessions; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sessions IS 'Auth: Stores session data associated to a user.';


--
-- Name: COLUMN sessions.not_after; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.not_after IS 'Auth: Not after is a nullable column that contains a timestamp after which the session should be regarded as expired.';


--
-- Name: COLUMN sessions.refresh_token_hmac_key; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.refresh_token_hmac_key IS 'Holds a HMAC-SHA256 key used to sign refresh tokens for this session.';


--
-- Name: COLUMN sessions.refresh_token_counter; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.refresh_token_counter IS 'Holds the ID (counter) of the last issued refresh token.';


--
-- Name: sso_domains; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sso_domains (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    domain text NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    CONSTRAINT "domain not empty" CHECK ((char_length(domain) > 0))
);


--
-- Name: TABLE sso_domains; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sso_domains IS 'Auth: Manages SSO email address domain mapping to an SSO Identity Provider.';


--
-- Name: sso_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sso_providers (
    id uuid NOT NULL,
    resource_id text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    disabled boolean,
    CONSTRAINT "resource_id not empty" CHECK (((resource_id = NULL::text) OR (char_length(resource_id) > 0)))
);


--
-- Name: TABLE sso_providers; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sso_providers IS 'Auth: Manages SSO identity provider information; see saml_providers for SAML.';


--
-- Name: COLUMN sso_providers.resource_id; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sso_providers.resource_id IS 'Auth: Uniquely identifies a SSO provider according to a user-chosen resource ID (case insensitive), useful in infrastructure as code.';


--
-- Name: users; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.users (
    instance_id uuid,
    id uuid NOT NULL,
    aud character varying(255),
    role character varying(255),
    email character varying(255),
    encrypted_password character varying(255),
    email_confirmed_at timestamp with time zone,
    invited_at timestamp with time zone,
    confirmation_token character varying(255),
    confirmation_sent_at timestamp with time zone,
    recovery_token character varying(255),
    recovery_sent_at timestamp with time zone,
    email_change_token_new character varying(255),
    email_change character varying(255),
    email_change_sent_at timestamp with time zone,
    last_sign_in_at timestamp with time zone,
    raw_app_meta_data jsonb,
    raw_user_meta_data jsonb,
    is_super_admin boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    phone text DEFAULT NULL::character varying,
    phone_confirmed_at timestamp with time zone,
    phone_change text DEFAULT ''::character varying,
    phone_change_token character varying(255) DEFAULT ''::character varying,
    phone_change_sent_at timestamp with time zone,
    confirmed_at timestamp with time zone GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at)) STORED,
    email_change_token_current character varying(255) DEFAULT ''::character varying,
    email_change_confirm_status smallint DEFAULT 0,
    banned_until timestamp with time zone,
    reauthentication_token character varying(255) DEFAULT ''::character varying,
    reauthentication_sent_at timestamp with time zone,
    is_sso_user boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    is_anonymous boolean DEFAULT false NOT NULL,
    CONSTRAINT users_email_change_confirm_status_check CHECK (((email_change_confirm_status >= 0) AND (email_change_confirm_status <= 2)))
);


--
-- Name: TABLE users; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.users IS 'Auth: Stores user login data within a secure schema.';


--
-- Name: COLUMN users.is_sso_user; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.users.is_sso_user IS 'Auth: Set this column to true when the account comes from SSO. These accounts can have duplicate emails.';


--
-- Name: refresh_tokens id; Type: DEFAULT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens ALTER COLUMN id SET DEFAULT nextval('auth.refresh_tokens_id_seq'::regclass);


--
-- Data for Name: audit_log_entries; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) FROM stdin;
00000000-0000-0000-0000-000000000000	184b2270-3d0c-4e89-8478-d28ab0ef7d20	{"action":"user_signedup","actor_id":"a42f3961-22a6-4a52-9ded-8f6230b5329c","actor_username":"rahul@pnut.moster","actor_via_sso":false,"log_type":"team","traits":{"provider":"email"}}	2026-03-05 04:50:27.575075+00	
00000000-0000-0000-0000-000000000000	f18db74c-412a-4e29-ab0a-e0d2ae4cd87b	{"action":"login","actor_id":"a42f3961-22a6-4a52-9ded-8f6230b5329c","actor_username":"rahul@pnut.moster","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}	2026-03-05 04:50:27.589628+00	
00000000-0000-0000-0000-000000000000	78d21b93-890f-4ccc-96c1-a39170bcfe0c	{"action":"user_recovery_requested","actor_id":"a42f3961-22a6-4a52-9ded-8f6230b5329c","actor_username":"rahul@pnut.moster","actor_via_sso":false,"log_type":"user"}	2026-03-05 04:50:27.693012+00	
00000000-0000-0000-0000-000000000000	4c05ecd9-fc81-4767-98f2-649a33f03de5	{"action":"login","actor_id":"a42f3961-22a6-4a52-9ded-8f6230b5329c","actor_username":"rahul@pnut.moster","actor_via_sso":false,"log_type":"account"}	2026-03-05 04:50:40.122691+00	
00000000-0000-0000-0000-000000000000	41600ed0-27a3-411b-8fc9-1eb1715137cf	{"action":"user_signedup","actor_id":"00000000-0000-0000-0000-000000000000","actor_username":"service_role","actor_via_sso":false,"log_type":"team","traits":{"provider":"email","user_email":"admin@pnut.monster","user_id":"41846fd9-03d4-4f5d-b47e-af396cb90cdb","user_phone":""}}	2026-03-05 04:55:20.558305+00	
00000000-0000-0000-0000-000000000000	7d285af2-6685-43c6-9023-ea81f21f1e00	{"action":"user_signedup","actor_id":"00000000-0000-0000-0000-000000000000","actor_username":"service_role","actor_via_sso":false,"log_type":"team","traits":{"provider":"email","user_email":"staff@koramangala.pnut.monster","user_id":"0d6797fd-06c5-41c2-b15e-146cf8813b9f","user_phone":""}}	2026-03-05 04:55:20.913214+00	
00000000-0000-0000-0000-000000000000	addae5c9-1212-4b23-9172-61c52ea9efe6	{"action":"user_recovery_requested","actor_id":"a42f3961-22a6-4a52-9ded-8f6230b5329c","actor_username":"rahul@pnut.moster","actor_via_sso":false,"log_type":"user"}	2026-03-05 05:02:14.207604+00	
00000000-0000-0000-0000-000000000000	c0e553c1-a4bb-4fc4-b76c-de3a29763dc0	{"action":"login","actor_id":"a42f3961-22a6-4a52-9ded-8f6230b5329c","actor_username":"rahul@pnut.moster","actor_via_sso":false,"log_type":"account"}	2026-03-05 05:02:52.195071+00	
00000000-0000-0000-0000-000000000000	6927a2fc-439f-453c-b0f3-152d7120f1cb	{"action":"logout","actor_id":"a42f3961-22a6-4a52-9ded-8f6230b5329c","actor_username":"rahul@pnut.moster","actor_via_sso":false,"log_type":"account"}	2026-03-05 05:08:11.922312+00	
00000000-0000-0000-0000-000000000000	f457ae4d-8725-47bd-a2a2-d043b09a0d84	{"action":"user_signedup","actor_id":"9774858f-6e0c-4fd6-adc6-16a60b95ed23","actor_username":"rahul@pnut.monster","actor_via_sso":false,"log_type":"team","traits":{"provider":"email"}}	2026-03-05 05:23:42.478142+00	
00000000-0000-0000-0000-000000000000	c898e16a-3463-4278-852e-7f83157df275	{"action":"login","actor_id":"9774858f-6e0c-4fd6-adc6-16a60b95ed23","actor_username":"rahul@pnut.monster","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}	2026-03-05 05:23:42.491354+00	
00000000-0000-0000-0000-000000000000	3c5045a0-1881-4f82-89ce-b5419571fd6f	{"action":"user_recovery_requested","actor_id":"9774858f-6e0c-4fd6-adc6-16a60b95ed23","actor_username":"rahul@pnut.monster","actor_via_sso":false,"log_type":"user"}	2026-03-05 05:23:42.542188+00	
00000000-0000-0000-0000-000000000000	4d18f399-8a42-45b6-96fc-2b496147af62	{"action":"user_signedup","actor_id":"e2e6c9e1-79e1-4f2e-a507-efd2bb62b1bd","actor_username":"test@example.com","actor_via_sso":false,"log_type":"team","traits":{"provider":"email"}}	2026-03-05 05:27:00.366341+00	
00000000-0000-0000-0000-000000000000	3845185a-6076-406f-9d77-aef9daab8c77	{"action":"login","actor_id":"e2e6c9e1-79e1-4f2e-a507-efd2bb62b1bd","actor_username":"test@example.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}	2026-03-05 05:27:00.379923+00	
00000000-0000-0000-0000-000000000000	03267560-d79e-429d-9a19-8afe894f61d3	{"action":"user_recovery_requested","actor_id":"e2e6c9e1-79e1-4f2e-a507-efd2bb62b1bd","actor_username":"test@example.com","actor_via_sso":false,"log_type":"user"}	2026-03-05 05:27:00.434537+00	
00000000-0000-0000-0000-000000000000	209ed438-91f9-4ae6-b6b4-d58c32dc3f21	{"action":"user_recovery_requested","actor_id":"9774858f-6e0c-4fd6-adc6-16a60b95ed23","actor_username":"rahul@pnut.monster","actor_via_sso":false,"log_type":"user"}	2026-03-05 05:33:31.555343+00	
00000000-0000-0000-0000-000000000000	d71bc446-364e-489f-bd3e-b7ea730e6207	{"action":"user_recovery_requested","actor_id":"9774858f-6e0c-4fd6-adc6-16a60b95ed23","actor_username":"rahul@pnut.monster","actor_via_sso":false,"log_type":"user"}	2026-03-05 05:34:05.103479+00	
00000000-0000-0000-0000-000000000000	f8a3af67-4a97-4092-8ee5-004cd72c92cb	{"action":"login","actor_id":"9774858f-6e0c-4fd6-adc6-16a60b95ed23","actor_username":"rahul@pnut.monster","actor_via_sso":false,"log_type":"account"}	2026-03-05 05:34:15.833027+00	
00000000-0000-0000-0000-000000000000	eec89acf-bc8f-4cc7-96fc-9494d19f8448	{"action":"login","actor_id":"41846fd9-03d4-4f5d-b47e-af396cb90cdb","actor_name":"Admin User","actor_username":"admin@pnut.monster","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}	2026-03-05 05:59:50.604615+00	
00000000-0000-0000-0000-000000000000	1d034a17-c740-41b4-8965-3ee2d9e5f63e	{"action":"user_deleted","actor_id":"00000000-0000-0000-0000-000000000000","actor_username":"service_role","actor_via_sso":false,"log_type":"team","traits":{"user_email":"admin@pnut.monster","user_id":"41846fd9-03d4-4f5d-b47e-af396cb90cdb","user_phone":""}}	2026-03-05 06:00:29.337698+00	
00000000-0000-0000-0000-000000000000	7eb81e8a-ad8c-4d81-9743-7a3d40585c4a	{"action":"user_signedup","actor_id":"00000000-0000-0000-0000-000000000000","actor_username":"service_role","actor_via_sso":false,"log_type":"team","traits":{"provider":"email","user_email":"admin@pnut.monster","user_id":"75d4766d-5355-4b0b-8243-330760501584","user_phone":""}}	2026-03-05 06:00:29.564813+00	
00000000-0000-0000-0000-000000000000	a0a39683-7627-4081-89a2-19a865c19ec8	{"action":"login","actor_id":"75d4766d-5355-4b0b-8243-330760501584","actor_name":"Admin User","actor_username":"admin@pnut.monster","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}	2026-03-05 06:00:49.051246+00	
00000000-0000-0000-0000-000000000000	37b54c19-6fca-43f3-be7a-8125b878a6a6	{"action":"login","actor_id":"75d4766d-5355-4b0b-8243-330760501584","actor_name":"Admin User","actor_username":"admin@pnut.monster","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}	2026-03-05 06:02:13.349808+00	
00000000-0000-0000-0000-000000000000	1eb0512e-a90b-4860-9665-7d405dab48f4	{"action":"login","actor_id":"75d4766d-5355-4b0b-8243-330760501584","actor_name":"Admin User","actor_username":"admin@pnut.monster","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}	2026-03-05 06:08:26.554181+00	
00000000-0000-0000-0000-000000000000	98dcf1b7-152e-4539-aa69-a51c792764f0	{"action":"token_refreshed","actor_id":"9774858f-6e0c-4fd6-adc6-16a60b95ed23","actor_username":"rahul@pnut.monster","actor_via_sso":false,"log_type":"token"}	2026-03-06 17:42:13.056825+00	
00000000-0000-0000-0000-000000000000	187b3f9d-b8cd-4cea-b07c-d9ef050be2fa	{"action":"token_revoked","actor_id":"9774858f-6e0c-4fd6-adc6-16a60b95ed23","actor_username":"rahul@pnut.monster","actor_via_sso":false,"log_type":"token"}	2026-03-06 17:42:13.074981+00	
00000000-0000-0000-0000-000000000000	594376f2-5547-4665-b22b-51a3405141b2	{"action":"user_recovery_requested","actor_id":"9774858f-6e0c-4fd6-adc6-16a60b95ed23","actor_username":"rahul@pnut.monster","actor_via_sso":false,"log_type":"user"}	2026-03-06 17:42:24.581443+00	
00000000-0000-0000-0000-000000000000	f0133d00-3087-4c1e-9d61-7f0c5bde48ef	{"action":"login","actor_id":"9774858f-6e0c-4fd6-adc6-16a60b95ed23","actor_username":"rahul@pnut.monster","actor_via_sso":false,"log_type":"account"}	2026-03-06 17:42:49.044986+00	
00000000-0000-0000-0000-000000000000	5a743297-94d2-43dd-a2aa-d16403b67985	{"action":"login","actor_id":"75d4766d-5355-4b0b-8243-330760501584","actor_name":"Admin User","actor_username":"admin@pnut.monster","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}	2026-03-06 17:52:33.462192+00	
00000000-0000-0000-0000-000000000000	ba05689d-f73f-4961-aafc-2bfb5274d2d5	{"action":"token_refreshed","actor_id":"75d4766d-5355-4b0b-8243-330760501584","actor_name":"Admin User","actor_username":"admin@pnut.monster","actor_via_sso":false,"log_type":"token"}	2026-03-06 19:05:44.171086+00	
00000000-0000-0000-0000-000000000000	89ee7c44-7fa8-474f-bc3a-27273bbc6458	{"action":"token_revoked","actor_id":"75d4766d-5355-4b0b-8243-330760501584","actor_name":"Admin User","actor_username":"admin@pnut.monster","actor_via_sso":false,"log_type":"token"}	2026-03-06 19:05:44.173525+00	
00000000-0000-0000-0000-000000000000	a4211f4d-7280-438b-af83-d48b286051de	{"action":"token_refreshed","actor_id":"75d4766d-5355-4b0b-8243-330760501584","actor_name":"Admin User","actor_username":"admin@pnut.monster","actor_via_sso":false,"log_type":"token"}	2026-03-06 20:17:17.656662+00	
00000000-0000-0000-0000-000000000000	744bd7fd-0e5b-48d8-873b-634503f76108	{"action":"token_revoked","actor_id":"75d4766d-5355-4b0b-8243-330760501584","actor_name":"Admin User","actor_username":"admin@pnut.monster","actor_via_sso":false,"log_type":"token"}	2026-03-06 20:17:17.658307+00	
00000000-0000-0000-0000-000000000000	ee9f35bd-1b84-411f-a5e8-6f0880d27a5c	{"action":"user_signedup","actor_id":"ed2c107b-ffeb-4225-8b7d-cf59f3c6d998","actor_username":"rudrakakkar26@gmail.com","actor_via_sso":false,"log_type":"team","traits":{"provider":"email"}}	2026-03-12 06:15:15.402063+00	
00000000-0000-0000-0000-000000000000	0e1d12a1-40c0-41a2-9d08-d845b67e059b	{"action":"login","actor_id":"ed2c107b-ffeb-4225-8b7d-cf59f3c6d998","actor_username":"rudrakakkar26@gmail.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}	2026-03-12 06:15:15.445985+00	
00000000-0000-0000-0000-000000000000	31dd3307-10ba-462a-a74b-da7b8914fc85	{"action":"user_recovery_requested","actor_id":"ed2c107b-ffeb-4225-8b7d-cf59f3c6d998","actor_username":"rudrakakkar26@gmail.com","actor_via_sso":false,"log_type":"user"}	2026-03-12 06:15:54.042897+00	
00000000-0000-0000-0000-000000000000	163896ce-e6a8-409f-b856-6af4411a27dd	{"action":"login","actor_id":"ed2c107b-ffeb-4225-8b7d-cf59f3c6d998","actor_username":"rudrakakkar26@gmail.com","actor_via_sso":false,"log_type":"account"}	2026-03-12 06:16:19.594468+00	
00000000-0000-0000-0000-000000000000	55a6f309-e93f-4152-8241-36c72aff7907	{"action":"user_recovery_requested","actor_id":"9774858f-6e0c-4fd6-adc6-16a60b95ed23","actor_username":"rahul@pnut.monster","actor_via_sso":false,"log_type":"user"}	2026-03-12 06:19:01.084571+00	
00000000-0000-0000-0000-000000000000	48ea7c13-3959-402d-acdf-4ece8440fe7e	{"action":"login","actor_id":"9774858f-6e0c-4fd6-adc6-16a60b95ed23","actor_username":"rahul@pnut.monster","actor_via_sso":false,"log_type":"account"}	2026-03-12 06:19:14.822975+00	
00000000-0000-0000-0000-000000000000	75920994-bc82-48d9-8779-b779b660c72c	{"action":"user_signedup","actor_id":"00000000-0000-0000-0000-000000000000","actor_username":"service_role","actor_via_sso":false,"log_type":"team","traits":{"provider":"email","user_email":"admin@pnutmonster.com","user_id":"fd7f5bcd-cea8-460c-b096-78b9fab8e9ac","user_phone":""}}	2026-03-12 06:25:37.468621+00	
00000000-0000-0000-0000-000000000000	e2664840-abb3-410e-ac5b-f8080e0cebad	{"action":"login","actor_id":"fd7f5bcd-cea8-460c-b096-78b9fab8e9ac","actor_name":"Admin","actor_username":"admin@pnutmonster.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}	2026-03-12 06:26:09.155115+00	
00000000-0000-0000-0000-000000000000	05947d49-ea0a-47b3-b865-52d960c53553	{"action":"login","actor_id":"fd7f5bcd-cea8-460c-b096-78b9fab8e9ac","actor_name":"Admin","actor_username":"admin@pnutmonster.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}	2026-03-12 06:26:53.100657+00	
00000000-0000-0000-0000-000000000000	34442f05-9500-429f-9da1-459872a0d965	{"action":"token_refreshed","actor_id":"ed2c107b-ffeb-4225-8b7d-cf59f3c6d998","actor_username":"rudrakakkar26@gmail.com","actor_via_sso":false,"log_type":"token"}	2026-03-12 07:14:56.699379+00	
00000000-0000-0000-0000-000000000000	c1996ba4-4e6e-42fa-844e-27de2f1901f1	{"action":"token_revoked","actor_id":"ed2c107b-ffeb-4225-8b7d-cf59f3c6d998","actor_username":"rudrakakkar26@gmail.com","actor_via_sso":false,"log_type":"token"}	2026-03-12 07:14:56.700611+00	
00000000-0000-0000-0000-000000000000	fcf269eb-0c2f-48ae-bee0-5e17009b025b	{"action":"user_recovery_requested","actor_id":"9774858f-6e0c-4fd6-adc6-16a60b95ed23","actor_username":"rahul@pnut.monster","actor_via_sso":false,"log_type":"user"}	2026-03-12 07:24:30.798209+00	
00000000-0000-0000-0000-000000000000	9ac68c62-0af8-47dc-81f6-52dc12b599c0	{"action":"login","actor_id":"9774858f-6e0c-4fd6-adc6-16a60b95ed23","actor_username":"rahul@pnut.monster","actor_via_sso":false,"log_type":"account"}	2026-03-12 07:24:42.383649+00	
00000000-0000-0000-0000-000000000000	e1b72482-64d3-4744-847b-204439ebc3f3	{"action":"token_refreshed","actor_id":"fd7f5bcd-cea8-460c-b096-78b9fab8e9ac","actor_name":"Admin","actor_username":"admin@pnutmonster.com","actor_via_sso":false,"log_type":"token"}	2026-03-12 07:25:02.268254+00	
00000000-0000-0000-0000-000000000000	681b8e52-3463-487d-a4bc-e2dac7b0ed98	{"action":"token_revoked","actor_id":"fd7f5bcd-cea8-460c-b096-78b9fab8e9ac","actor_name":"Admin","actor_username":"admin@pnutmonster.com","actor_via_sso":false,"log_type":"token"}	2026-03-12 07:25:02.269227+00	
00000000-0000-0000-0000-000000000000	e270703b-8b64-4c9c-ac33-5e798505538c	{"action":"token_refreshed","actor_id":"9774858f-6e0c-4fd6-adc6-16a60b95ed23","actor_username":"rahul@pnut.monster","actor_via_sso":false,"log_type":"token"}	2026-03-12 07:35:01.153742+00	
00000000-0000-0000-0000-000000000000	c6f59b33-fe95-4833-aef0-f03f6ec01d98	{"action":"token_revoked","actor_id":"9774858f-6e0c-4fd6-adc6-16a60b95ed23","actor_username":"rahul@pnut.monster","actor_via_sso":false,"log_type":"token"}	2026-03-12 07:35:01.15724+00	
00000000-0000-0000-0000-000000000000	6acf60ec-9113-4e00-915b-09944a060ce7	{"action":"login","actor_id":"fd7f5bcd-cea8-460c-b096-78b9fab8e9ac","actor_name":"Admin","actor_username":"admin@pnutmonster.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}	2026-03-12 07:35:53.293335+00	
00000000-0000-0000-0000-000000000000	51025c08-c620-440c-8da5-1a1b1cf54fa3	{"action":"logout","actor_id":"fd7f5bcd-cea8-460c-b096-78b9fab8e9ac","actor_name":"Admin","actor_username":"admin@pnutmonster.com","actor_via_sso":false,"log_type":"account"}	2026-03-12 07:35:53.372935+00	
00000000-0000-0000-0000-000000000000	d26838a8-b26c-4455-80d4-320fee711975	{"action":"logout","actor_id":"9774858f-6e0c-4fd6-adc6-16a60b95ed23","actor_username":"rahul@pnut.monster","actor_via_sso":false,"log_type":"account"}	2026-03-12 07:36:38.284918+00	
00000000-0000-0000-0000-000000000000	1a9472cf-731e-4fb8-bfc8-200b4ad3f53a	{"action":"user_recovery_requested","actor_id":"9774858f-6e0c-4fd6-adc6-16a60b95ed23","actor_username":"rahul@pnut.monster","actor_via_sso":false,"log_type":"user"}	2026-03-12 07:36:47.167319+00	
00000000-0000-0000-0000-000000000000	8a7348dd-4977-4384-96c0-2da81a64faa6	{"action":"login","actor_id":"9774858f-6e0c-4fd6-adc6-16a60b95ed23","actor_username":"rahul@pnut.monster","actor_via_sso":false,"log_type":"account"}	2026-03-12 07:37:03.598397+00	
00000000-0000-0000-0000-000000000000	c5fea64a-aa73-43c4-a76b-cb13f4420d93	{"action":"user_signedup","actor_id":"00000000-0000-0000-0000-000000000000","actor_username":"service_role","actor_via_sso":false,"log_type":"team","traits":{"provider":"email","user_email":"customer@pnutmonster.com","user_id":"9c9fb404-da5d-44b3-949f-1187d9f9b4b2","user_phone":""}}	2026-04-10 06:22:40.314401+00	
00000000-0000-0000-0000-000000000000	02c45ef5-cdce-4ce6-bced-7f06dea0d1ac	{"action":"user_signedup","actor_id":"00000000-0000-0000-0000-000000000000","actor_username":"service_role","actor_via_sso":false,"log_type":"team","traits":{"provider":"email","user_email":"staff@pnutmonster.com","user_id":"e78a1d4b-4351-4f07-8034-26e28d7026ed","user_phone":""}}	2026-04-10 06:23:14.113988+00	
00000000-0000-0000-0000-000000000000	febeaeaf-17f5-426a-91d6-ac778f1363a8	{"action":"login","actor_id":"fd7f5bcd-cea8-460c-b096-78b9fab8e9ac","actor_name":"Admin","actor_username":"admin@pnutmonster.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}	2026-04-10 06:29:06.696334+00	
00000000-0000-0000-0000-000000000000	ad8ecad7-76dc-4450-b50a-f9585040f110	{"action":"user_recovery_requested","actor_id":"9c9fb404-da5d-44b3-949f-1187d9f9b4b2","actor_name":"Test Customer","actor_username":"customer@pnutmonster.com","actor_via_sso":false,"log_type":"user"}	2026-04-10 06:36:54.770894+00	
00000000-0000-0000-0000-000000000000	675caa64-4e38-4c16-b633-32b83f19125e	{"action":"user_recovery_requested","actor_id":"9774858f-6e0c-4fd6-adc6-16a60b95ed23","actor_username":"rahul@pnut.monster","actor_via_sso":false,"log_type":"user"}	2026-04-10 06:37:05.000197+00	
00000000-0000-0000-0000-000000000000	2e1ec066-1480-40d7-87c6-bf81081f3bcd	{"action":"user_recovery_requested","actor_id":"9774858f-6e0c-4fd6-adc6-16a60b95ed23","actor_username":"rahul@pnut.monster","actor_via_sso":false,"log_type":"user"}	2026-04-10 06:39:05.903677+00	
00000000-0000-0000-0000-000000000000	7bdae3e4-99ef-49b9-bee4-cef5c9ed7bf0	{"action":"login","actor_id":"9774858f-6e0c-4fd6-adc6-16a60b95ed23","actor_username":"rahul@pnut.monster","actor_via_sso":false,"log_type":"account"}	2026-04-10 06:39:16.33447+00	
00000000-0000-0000-0000-000000000000	0c1208cd-a59f-4083-8a76-5ebfbab1d866	{"action":"login","actor_id":"e78a1d4b-4351-4f07-8034-26e28d7026ed","actor_name":"Staff User","actor_username":"staff@pnutmonster.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}	2026-04-10 06:42:05.021408+00	
\.


--
-- Data for Name: custom_oauth_providers; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.custom_oauth_providers (id, provider_type, identifier, name, client_id, client_secret, acceptable_client_ids, scopes, pkce_enabled, attribute_mapping, authorization_params, enabled, email_optional, issuer, discovery_url, skip_nonce_check, cached_discovery, discovery_cached_at, authorization_url, token_url, userinfo_url, jwks_uri, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: flow_state; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.flow_state (id, user_id, auth_code, code_challenge_method, code_challenge, provider_type, provider_access_token, provider_refresh_token, created_at, updated_at, authentication_method, auth_code_issued_at, invite_token, referrer, oauth_client_state_id, linking_target_id, email_optional) FROM stdin;
e0a89e66-29af-4bc2-88cb-cde0aba1f409	a42f3961-22a6-4a52-9ded-8f6230b5329c	22c61f15-8b5b-4622-b13b-a71646313cc2	s256	6YcdzWXOC4uiUw5RXqwwyOVAGxijpyrItEdjrSiNpOA	magiclink			2026-03-05 04:50:27.663324+00	2026-03-05 04:50:27.663324+00	magiclink	\N	\N	\N	\N	\N	f
5673a1a5-cd09-432d-9dec-05106e58f27f	a42f3961-22a6-4a52-9ded-8f6230b5329c	768fd976-89da-4ed3-8a62-d29fc2a564f5	s256	EoUtGQsa_TuwWsM2OYxpDvz-ZhfLD_L-tlWALU3OvxA	magiclink			2026-03-05 05:02:14.176999+00	2026-03-05 05:02:14.176999+00	magiclink	\N	\N	\N	\N	\N	f
a3df82d6-965d-4342-b0e1-4db1d8b5a42a	9774858f-6e0c-4fd6-adc6-16a60b95ed23	fcb80f0b-57b9-4ced-9fed-7042925fb712	plain	f0e22ba70e6609f4d95c27e522bcc154ec25b1f558261ee2a13778e5d3d5fd862b495257ac6cde3e3bf05f5c64617b97b5bd36cf3e14321a	magiclink			2026-03-05 05:33:31.525469+00	2026-03-05 05:33:31.525469+00	magiclink	\N	\N	\N	\N	\N	f
37414a4b-c261-45f8-a979-7c4c7d1192b0	9774858f-6e0c-4fd6-adc6-16a60b95ed23	15a97302-d12f-4ec8-97ec-ee806af85f3c	plain	f1ce7520fc104729f4fd04d2b6c91b3c78e3af5e4dc82dfe1b1e96ee49fa21027eec4ebd739533bd099f6bb9336db279135cfdf79770e430	magiclink			2026-03-05 05:34:05.07557+00	2026-03-05 05:34:05.07557+00	magiclink	\N	\N	\N	\N	\N	f
af01029a-ebc5-4f51-a752-5a4360dbb1c2	9774858f-6e0c-4fd6-adc6-16a60b95ed23	c8714c3f-791a-4798-a9f5-eef2bce9fb78	plain	90d37ea1c1495ed1e401579005262c100d97e671104480280136f962371dc4b890570bee1c6ba6700ca1772bdcc8646537eb23765c259ead	magiclink			2026-03-06 17:42:24.541474+00	2026-03-06 17:42:24.541474+00	magiclink	\N	\N	\N	\N	\N	f
98f9efb6-a84a-4fb1-8bb5-1211d9020342	ed2c107b-ffeb-4225-8b7d-cf59f3c6d998	9cd46dff-e0be-4cbc-b988-3753a891b0f3	plain	6f2c89eb3cf47c432351f9f20ee3c509d4410c9fc82de90d7277a0941a5400f8135b94cf0a47811b00faba2f9288c290e1841c9640939727	magiclink			2026-03-12 06:15:15.59699+00	2026-03-12 06:15:15.59699+00	magiclink	\N	\N	\N	\N	\N	f
973a8853-6b85-43df-afe8-4b7b89cc1398	ed2c107b-ffeb-4225-8b7d-cf59f3c6d998	db316f8f-7583-41ed-9fa2-42076f4500a2	plain	10cfd1f2f7e1c94506dbe4ee55b22adad37a3a3832d430a5986f77957f942fcd1e6a8be10ff707f27a7eed7d0b704bfcaf02b748763100a2	magiclink			2026-03-12 06:15:53.962143+00	2026-03-12 06:15:53.962143+00	magiclink	\N	\N	\N	\N	\N	f
790b1739-0496-49f1-9321-a237b7edb3ac	9774858f-6e0c-4fd6-adc6-16a60b95ed23	b2805f2a-9433-4a35-adc7-7d619ff46ecf	plain	6f6bc2ff85e8785260fb66b3add523c6df35955d97fd8e8895c4f63cb0f0baa8c20f7e9901b533622bcb30b3a547a123903aaf1d27a7db46	magiclink			2026-03-12 06:19:01.056036+00	2026-03-12 06:19:01.056036+00	magiclink	\N	\N	\N	\N	\N	f
2b72fb9e-091f-4e54-8eed-d89eb8bd724a	9774858f-6e0c-4fd6-adc6-16a60b95ed23	d4c546a1-808e-45b7-81a4-427afa6673bb	plain	26d246b7ac30a25680d1037afb937a1e6aa5ee741256f17f8542ed2cc27faa784872b2f0f191ac9acdf68528253879663c272f4605fc3135	magiclink			2026-03-12 07:24:30.768954+00	2026-03-12 07:24:30.768954+00	magiclink	\N	\N	\N	\N	\N	f
33bd6492-16e5-4a38-a5de-fbabec492a2d	9774858f-6e0c-4fd6-adc6-16a60b95ed23	9a60b4f8-954d-45da-9dae-fbe0ce3694ba	plain	b564d8774a007c3ec209c0e087be2691562eb469cb949a7897fcc22d55cee4b148c8bd18e460a72e5f60e0b1340f9b32bf6cd2ce8562256a	magiclink			2026-03-12 07:36:47.138779+00	2026-03-12 07:36:47.138779+00	magiclink	\N	\N	\N	\N	\N	f
92094d79-7564-4e00-8f9b-287c5b314dd8	9774858f-6e0c-4fd6-adc6-16a60b95ed23	96a6033c-df4c-47e7-a686-596d61dd36e5	plain	13c8efc2a75b390fd77b02e0c236bab03f4bb5d9eb40392b933c3189e66262634650e7f562cad16c743499adb2c45ecf3c421c574e8f318c	magiclink			2026-04-10 06:33:43.020303+00	2026-04-10 06:33:43.020303+00	magiclink	\N	\N	\N	\N	\N	f
ce979d3f-a9de-4e4f-8e18-10547693ae1b	9774858f-6e0c-4fd6-adc6-16a60b95ed23	122a9b0f-cace-4b9e-9d87-9c935c89f318	plain	30fff9072584ac58d83cb0098a7c4c36683f518eb6c2c8d24249dd6b6f9ecb6b8ffc22232bb4b66c18f88b5b9fa23bb81686dd6eca17885c	magiclink			2026-04-10 06:33:44.6113+00	2026-04-10 06:33:44.6113+00	magiclink	\N	\N	\N	\N	\N	f
415cb6c0-19e5-41b3-953b-159e70c47a9e	9774858f-6e0c-4fd6-adc6-16a60b95ed23	4020973c-1e50-408d-a69f-c5e044a680e7	plain	739c2cca007788b9350c3f3250dfa2e76cd648580637c260ad3f57aef9181fef1cbf0daa4df88c7677bdaa18233b6d9ee91e1b71c950a93f	magiclink			2026-04-10 06:34:04.815248+00	2026-04-10 06:34:04.815248+00	magiclink	\N	\N	\N	\N	\N	f
f25f03df-a93c-4804-80c6-19c8fe38138a	9774858f-6e0c-4fd6-adc6-16a60b95ed23	e3338df6-0e91-4a53-9cd6-e694260cae80	plain	5f166ac515ebf5685c989500456a5fdefcd52682b744882528a1461901400700255c2383d251febd3094838297cceaafb4b3f016a4dbeabe	magiclink			2026-04-10 06:34:17.109443+00	2026-04-10 06:34:17.109443+00	magiclink	\N	\N	\N	\N	\N	f
1552e055-5c95-48c2-bf7d-738999b9728d	9774858f-6e0c-4fd6-adc6-16a60b95ed23	26f9979d-e6e4-4639-8ce3-1c76e2e79057	plain	8e06778d637e9f21e105ef094f112524033c366a107ff73e543d68df18ee30afec41ebd6136e88ba40b615f77c30274f2aae596fd40a8529	magiclink			2026-04-10 06:37:04.987015+00	2026-04-10 06:37:04.987015+00	magiclink	\N	\N	\N	\N	\N	f
be8e1cee-8e8d-42dc-8641-a334b3476be1	9774858f-6e0c-4fd6-adc6-16a60b95ed23	627e495d-ec5f-4459-aabd-577a49a71ec2	plain	0560c50331c5cbadc7fd18e493a6784ff0eda53dd601697a1522cb740c95855496e05f744b940cc8cbffd64ec59d3d48047b6c27fff4ca87	magiclink			2026-04-10 06:39:05.893842+00	2026-04-10 06:39:05.893842+00	magiclink	\N	\N	\N	\N	\N	f
\.


--
-- Data for Name: identities; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, id) FROM stdin;
a42f3961-22a6-4a52-9ded-8f6230b5329c	a42f3961-22a6-4a52-9ded-8f6230b5329c	{"sub": "a42f3961-22a6-4a52-9ded-8f6230b5329c", "email": "rahul@pnut.moster", "email_verified": false, "phone_verified": false}	email	2026-03-05 04:50:27.567985+00	2026-03-05 04:50:27.568026+00	2026-03-05 04:50:27.568026+00	84b1a4f0-8311-4d02-a633-baa3a9f9ecc8
0d6797fd-06c5-41c2-b15e-146cf8813b9f	0d6797fd-06c5-41c2-b15e-146cf8813b9f	{"sub": "0d6797fd-06c5-41c2-b15e-146cf8813b9f", "email": "staff@koramangala.pnut.monster", "email_verified": false, "phone_verified": false}	email	2026-03-05 04:55:20.912162+00	2026-03-05 04:55:20.912189+00	2026-03-05 04:55:20.912189+00	cb97cd75-d6e1-46c2-8401-fcb1b1aa707a
9774858f-6e0c-4fd6-adc6-16a60b95ed23	9774858f-6e0c-4fd6-adc6-16a60b95ed23	{"sub": "9774858f-6e0c-4fd6-adc6-16a60b95ed23", "email": "rahul@pnut.monster", "email_verified": false, "phone_verified": false}	email	2026-03-05 05:23:42.474648+00	2026-03-05 05:23:42.474682+00	2026-03-05 05:23:42.474682+00	5d84b598-14ca-4edd-9ee0-8283fb5e63b4
e2e6c9e1-79e1-4f2e-a507-efd2bb62b1bd	e2e6c9e1-79e1-4f2e-a507-efd2bb62b1bd	{"sub": "e2e6c9e1-79e1-4f2e-a507-efd2bb62b1bd", "email": "test@example.com", "email_verified": false, "phone_verified": false}	email	2026-03-05 05:27:00.363615+00	2026-03-05 05:27:00.363645+00	2026-03-05 05:27:00.363645+00	bc985488-a486-4105-9a60-df1aae2128ca
75d4766d-5355-4b0b-8243-330760501584	75d4766d-5355-4b0b-8243-330760501584	{"sub": "75d4766d-5355-4b0b-8243-330760501584", "email": "admin@pnut.monster", "email_verified": false, "phone_verified": false}	email	2026-03-05 06:00:29.5633+00	2026-03-05 06:00:29.563356+00	2026-03-05 06:00:29.563356+00	70b28b47-c74c-47dd-9ff2-82b3add8d6a4
ed2c107b-ffeb-4225-8b7d-cf59f3c6d998	ed2c107b-ffeb-4225-8b7d-cf59f3c6d998	{"sub": "ed2c107b-ffeb-4225-8b7d-cf59f3c6d998", "email": "rudrakakkar26@gmail.com", "email_verified": false, "phone_verified": false}	email	2026-03-12 06:15:15.393565+00	2026-03-12 06:15:15.393621+00	2026-03-12 06:15:15.393621+00	7134b175-8be7-4665-9cdc-e95b0601b1be
fd7f5bcd-cea8-460c-b096-78b9fab8e9ac	fd7f5bcd-cea8-460c-b096-78b9fab8e9ac	{"sub": "fd7f5bcd-cea8-460c-b096-78b9fab8e9ac", "email": "admin@pnutmonster.com", "email_verified": false, "phone_verified": false}	email	2026-03-12 06:25:37.46724+00	2026-03-12 06:25:37.467278+00	2026-03-12 06:25:37.467278+00	87f7165f-9fa9-4481-88cd-39995d3e68d5
9c9fb404-da5d-44b3-949f-1187d9f9b4b2	9c9fb404-da5d-44b3-949f-1187d9f9b4b2	{"sub": "9c9fb404-da5d-44b3-949f-1187d9f9b4b2", "email": "customer@pnutmonster.com", "email_verified": false, "phone_verified": false}	email	2026-04-10 06:22:40.313993+00	2026-04-10 06:22:40.31402+00	2026-04-10 06:22:40.31402+00	4cd6fa48-dbb4-4a21-bf6b-87308c2e51c3
e78a1d4b-4351-4f07-8034-26e28d7026ed	e78a1d4b-4351-4f07-8034-26e28d7026ed	{"sub": "e78a1d4b-4351-4f07-8034-26e28d7026ed", "email": "staff@pnutmonster.com", "email_verified": false, "phone_verified": false}	email	2026-04-10 06:23:14.113601+00	2026-04-10 06:23:14.113621+00	2026-04-10 06:23:14.113621+00	fc1f5e6b-907d-4e30-830e-e2cfe5310e4b
\.


--
-- Data for Name: instances; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.instances (id, uuid, raw_base_config, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: mfa_amr_claims; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.mfa_amr_claims (session_id, created_at, updated_at, authentication_method, id) FROM stdin;
c95cbad2-9025-48a9-8695-26e430c8b0d7	2026-03-05 05:27:00.388977+00	2026-03-05 05:27:00.388977+00	password	d7280aad-0036-42ff-9e96-e337ad355c63
29d1319e-d32f-4229-b3b5-1e7e6d09ed11	2026-03-05 06:00:49.059678+00	2026-03-05 06:00:49.059678+00	password	38efd4df-1c94-46e9-a74b-f64a193b9a6a
125ffd7a-f525-4e0b-a829-f961f975847c	2026-03-05 06:02:13.356381+00	2026-03-05 06:02:13.356381+00	password	7e7bafe6-5853-4668-b9cb-50aba9883769
e4dd91b1-64fc-478f-a530-4747202192cd	2026-03-05 06:08:26.559582+00	2026-03-05 06:08:26.559582+00	password	747a16df-3fd2-44af-97d4-6527391d346b
20ec41b6-a419-407e-b6cc-6bec71992534	2026-03-06 17:52:33.470647+00	2026-03-06 17:52:33.470647+00	password	13a98b1e-7b8e-4568-8f2b-8740657d7fb2
245d6d9a-313e-40f0-a108-903780c58e86	2026-03-12 06:15:15.478948+00	2026-03-12 06:15:15.478948+00	password	5899172c-c3a5-4516-b10f-166977c0b1c0
34d16014-558f-408f-9598-f4829de8fe1b	2026-03-12 06:16:19.600978+00	2026-03-12 06:16:19.600978+00	otp	51bfe3de-06d4-4930-a020-ecee7de7d926
24c7feda-0255-4306-84f3-9eecd21b019f	2026-03-12 07:37:03.604287+00	2026-03-12 07:37:03.604287+00	otp	50f954b0-7979-4221-b625-0a6a9ef9a9e3
26cad712-d0b4-46fa-aabe-e1c2df149a7f	2026-04-10 06:29:06.703189+00	2026-04-10 06:29:06.703189+00	password	9c682789-ef8a-4843-957b-a44ed3ee0d45
c10e75d4-423f-49f3-a19d-447e24b09a12	2026-04-10 06:39:16.33849+00	2026-04-10 06:39:16.33849+00	otp	a597234d-7b70-45ab-84b2-7abda23b3a7e
ebba5249-6913-4f7e-920a-706805e0e54a	2026-04-10 06:42:05.023888+00	2026-04-10 06:42:05.023888+00	password	feef0a08-7936-4125-8fd6-02899c56eaae
\.


--
-- Data for Name: mfa_challenges; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.mfa_challenges (id, factor_id, created_at, verified_at, ip_address, otp_code, web_authn_session_data) FROM stdin;
\.


--
-- Data for Name: mfa_factors; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret, phone, last_challenged_at, web_authn_credential, web_authn_aaguid, last_webauthn_challenge_data) FROM stdin;
\.


--
-- Data for Name: oauth_authorizations; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.oauth_authorizations (id, authorization_id, client_id, user_id, redirect_uri, scope, state, resource, code_challenge, code_challenge_method, response_type, status, authorization_code, created_at, expires_at, approved_at, nonce) FROM stdin;
\.


--
-- Data for Name: oauth_client_states; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.oauth_client_states (id, provider_type, code_verifier, created_at) FROM stdin;
\.


--
-- Data for Name: oauth_clients; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.oauth_clients (id, client_secret_hash, registration_type, redirect_uris, grant_types, client_name, client_uri, logo_uri, created_at, updated_at, deleted_at, client_type, token_endpoint_auth_method) FROM stdin;
\.


--
-- Data for Name: oauth_consents; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.oauth_consents (id, user_id, client_id, scopes, granted_at, revoked_at) FROM stdin;
\.


--
-- Data for Name: one_time_tokens; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.one_time_tokens (id, user_id, token_type, token_hash, relates_to, created_at, updated_at) FROM stdin;
489b9f44-7acd-4ed7-8a44-d35da38b2dd6	e2e6c9e1-79e1-4f2e-a507-efd2bb62b1bd	recovery_token	42b5ac5364698705bb595519e328008456eb1983c942767fd0652d0d	test@example.com	2026-03-05 05:27:00.445292	2026-03-05 05:27:00.445292
188cb19e-deed-4d4a-8c40-d6fc79722f97	9c9fb404-da5d-44b3-949f-1187d9f9b4b2	recovery_token	7f6c35ce3b7de2558d767091932171d65e182a2b5c1512bb841ee9e6	customer@pnutmonster.com	2026-04-10 06:36:54.784501	2026-04-10 06:36:54.784501
\.


--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.refresh_tokens (instance_id, id, token, user_id, revoked, created_at, updated_at, parent, session_id) FROM stdin;
00000000-0000-0000-0000-000000000000	5	zsrdmtobqlyv	e2e6c9e1-79e1-4f2e-a507-efd2bb62b1bd	f	2026-03-05 05:27:00.386365+00	2026-03-05 05:27:00.386365+00	\N	c95cbad2-9025-48a9-8695-26e430c8b0d7
00000000-0000-0000-0000-000000000000	8	byzs4mbod5yc	75d4766d-5355-4b0b-8243-330760501584	f	2026-03-05 06:00:49.055188+00	2026-03-05 06:00:49.055188+00	\N	29d1319e-d32f-4229-b3b5-1e7e6d09ed11
00000000-0000-0000-0000-000000000000	9	iudrsdrvfi5n	75d4766d-5355-4b0b-8243-330760501584	f	2026-03-05 06:02:13.354386+00	2026-03-05 06:02:13.354386+00	\N	125ffd7a-f525-4e0b-a829-f961f975847c
00000000-0000-0000-0000-000000000000	10	dyhbrd3d4anf	75d4766d-5355-4b0b-8243-330760501584	f	2026-03-05 06:08:26.55747+00	2026-03-05 06:08:26.55747+00	\N	e4dd91b1-64fc-478f-a530-4747202192cd
00000000-0000-0000-0000-000000000000	13	ik2iij5jje72	75d4766d-5355-4b0b-8243-330760501584	t	2026-03-06 17:52:33.46755+00	2026-03-06 19:05:44.174406+00	\N	20ec41b6-a419-407e-b6cc-6bec71992534
00000000-0000-0000-0000-000000000000	14	3p5r5nle56ln	75d4766d-5355-4b0b-8243-330760501584	t	2026-03-06 19:05:44.17509+00	2026-03-06 20:17:17.659048+00	ik2iij5jje72	20ec41b6-a419-407e-b6cc-6bec71992534
00000000-0000-0000-0000-000000000000	15	fpn6f3y3wtp6	75d4766d-5355-4b0b-8243-330760501584	f	2026-03-06 20:17:17.660985+00	2026-03-06 20:17:17.660985+00	3p5r5nle56ln	20ec41b6-a419-407e-b6cc-6bec71992534
00000000-0000-0000-0000-000000000000	16	vnjlasmtn7ow	ed2c107b-ffeb-4225-8b7d-cf59f3c6d998	f	2026-03-12 06:15:15.463823+00	2026-03-12 06:15:15.463823+00	\N	245d6d9a-313e-40f0-a108-903780c58e86
00000000-0000-0000-0000-000000000000	17	hcndfjng5ra2	ed2c107b-ffeb-4225-8b7d-cf59f3c6d998	t	2026-03-12 06:16:19.599015+00	2026-03-12 07:14:56.70144+00	\N	34d16014-558f-408f-9598-f4829de8fe1b
00000000-0000-0000-0000-000000000000	21	hbb2b76bldtn	ed2c107b-ffeb-4225-8b7d-cf59f3c6d998	f	2026-03-12 07:14:56.702236+00	2026-03-12 07:14:56.702236+00	hcndfjng5ra2	34d16014-558f-408f-9598-f4829de8fe1b
00000000-0000-0000-0000-000000000000	26	dkeekm3s4kpc	9774858f-6e0c-4fd6-adc6-16a60b95ed23	f	2026-03-12 07:37:03.602369+00	2026-03-12 07:37:03.602369+00	\N	24c7feda-0255-4306-84f3-9eecd21b019f
00000000-0000-0000-0000-000000000000	27	azldla3y4zyz	fd7f5bcd-cea8-460c-b096-78b9fab8e9ac	f	2026-04-10 06:29:06.700671+00	2026-04-10 06:29:06.700671+00	\N	26cad712-d0b4-46fa-aabe-e1c2df149a7f
00000000-0000-0000-0000-000000000000	28	yyy6vdpcmsmm	9774858f-6e0c-4fd6-adc6-16a60b95ed23	f	2026-04-10 06:39:16.337365+00	2026-04-10 06:39:16.337365+00	\N	c10e75d4-423f-49f3-a19d-447e24b09a12
00000000-0000-0000-0000-000000000000	29	6kcurr2dh2oo	e78a1d4b-4351-4f07-8034-26e28d7026ed	f	2026-04-10 06:42:05.023118+00	2026-04-10 06:42:05.023118+00	\N	ebba5249-6913-4f7e-920a-706805e0e54a
\.


--
-- Data for Name: saml_providers; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.saml_providers (id, sso_provider_id, entity_id, metadata_xml, metadata_url, attribute_mapping, created_at, updated_at, name_id_format) FROM stdin;
\.


--
-- Data for Name: saml_relay_states; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.saml_relay_states (id, sso_provider_id, request_id, for_email, redirect_to, created_at, updated_at, flow_state_id) FROM stdin;
\.


--
-- Data for Name: schema_migrations; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.schema_migrations (version) FROM stdin;
20171026211738
20171026211808
20171026211834
20180103212743
20180108183307
20180119214651
20180125194653
00
20210710035447
20210722035447
20210730183235
20210909172000
20210927181326
20211122151130
20211124214934
20211202183645
20220114185221
20220114185340
20220224000811
20220323170000
20220429102000
20220531120530
20220614074223
20220811173540
20221003041349
20221003041400
20221011041400
20221020193600
20221021073300
20221021082433
20221027105023
20221114143122
20221114143410
20221125140132
20221208132122
20221215195500
20221215195800
20221215195900
20230116124310
20230116124412
20230131181311
20230322519590
20230402418590
20230411005111
20230508135423
20230523124323
20230818113222
20230914180801
20231027141322
20231114161723
20231117164230
20240115144230
20240214120130
20240306115329
20240314092811
20240427152123
20240612123726
20240729123726
20240802193726
20240806073726
20241009103726
20250717082212
20250731150234
20250804100000
20250901200500
20250903112500
20250904133000
20250925093508
20251007112900
20251104100000
20251111201300
20251201000000
20260115000000
20260121000000
20260219120000
\.


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.sessions (id, user_id, created_at, updated_at, factor_id, aal, not_after, refreshed_at, user_agent, ip, tag, oauth_client_id, refresh_token_hmac_key, refresh_token_counter, scopes) FROM stdin;
c95cbad2-9025-48a9-8695-26e430c8b0d7	e2e6c9e1-79e1-4f2e-a507-efd2bb62b1bd	2026-03-05 05:27:00.383055+00	2026-03-05 05:27:00.383055+00	\N	aal1	\N	\N	curl/8.7.1	192.168.65.1	\N	\N	\N	\N	\N
29d1319e-d32f-4229-b3b5-1e7e6d09ed11	75d4766d-5355-4b0b-8243-330760501584	2026-03-05 06:00:49.052993+00	2026-03-05 06:00:49.052993+00	\N	aal1	\N	\N	curl/8.7.1	192.168.65.1	\N	\N	\N	\N	\N
125ffd7a-f525-4e0b-a829-f961f975847c	75d4766d-5355-4b0b-8243-330760501584	2026-03-05 06:02:13.352255+00	2026-03-05 06:02:13.352255+00	\N	aal1	\N	\N	curl/8.7.1	192.168.65.1	\N	\N	\N	\N	\N
e4dd91b1-64fc-478f-a530-4747202192cd	75d4766d-5355-4b0b-8243-330760501584	2026-03-05 06:08:26.555553+00	2026-03-05 06:08:26.555553+00	\N	aal1	\N	\N	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36	192.168.65.1	\N	\N	\N	\N	\N
20ec41b6-a419-407e-b6cc-6bec71992534	75d4766d-5355-4b0b-8243-330760501584	2026-03-06 17:52:33.464439+00	2026-03-06 20:17:17.666214+00	\N	aal1	\N	2026-03-06 20:17:17.666149	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 Edg/145.0.0.0	192.168.65.1	\N	\N	\N	\N	\N
245d6d9a-313e-40f0-a108-903780c58e86	ed2c107b-ffeb-4225-8b7d-cf59f3c6d998	2026-03-12 06:15:15.4539+00	2026-03-12 06:15:15.4539+00	\N	aal1	\N	\N	Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1	172.19.0.1	\N	\N	\N	\N	\N
34d16014-558f-408f-9598-f4829de8fe1b	ed2c107b-ffeb-4225-8b7d-cf59f3c6d998	2026-03-12 06:16:19.597689+00	2026-03-12 07:14:56.705058+00	\N	aal1	\N	2026-03-12 07:14:56.704998	Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1	172.19.0.1	\N	\N	\N	\N	\N
24c7feda-0255-4306-84f3-9eecd21b019f	9774858f-6e0c-4fd6-adc6-16a60b95ed23	2026-03-12 07:37:03.601241+00	2026-03-12 07:37:03.601241+00	\N	aal1	\N	\N	Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.3 Mobile/15E148 Safari/604.1	172.19.0.1	\N	\N	\N	\N	\N
26cad712-d0b4-46fa-aabe-e1c2df149a7f	fd7f5bcd-cea8-460c-b096-78b9fab8e9ac	2026-04-10 06:29:06.696969+00	2026-04-10 06:29:06.696969+00	\N	aal1	\N	\N	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	192.168.65.1	\N	\N	\N	\N	\N
c10e75d4-423f-49f3-a19d-447e24b09a12	9774858f-6e0c-4fd6-adc6-16a60b95ed23	2026-04-10 06:39:16.336408+00	2026-04-10 06:39:16.336408+00	\N	aal1	\N	\N	Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.4 Mobile/15E148 Safari/604.1	192.168.65.1	\N	\N	\N	\N	\N
ebba5249-6913-4f7e-920a-706805e0e54a	e78a1d4b-4351-4f07-8034-26e28d7026ed	2026-04-10 06:42:05.02212+00	2026-04-10 06:42:05.02212+00	\N	aal1	\N	\N	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	192.168.65.1	\N	\N	\N	\N	\N
\.


--
-- Data for Name: sso_domains; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.sso_domains (id, sso_provider_id, domain, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: sso_providers; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.sso_providers (id, resource_id, created_at, updated_at, disabled) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: auth; Owner: -
--

COPY auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, invited_at, confirmation_token, confirmation_sent_at, recovery_token, recovery_sent_at, email_change_token_new, email_change, email_change_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, phone, phone_confirmed_at, phone_change, phone_change_token, phone_change_sent_at, email_change_token_current, email_change_confirm_status, banned_until, reauthentication_token, reauthentication_sent_at, is_sso_user, deleted_at, is_anonymous) FROM stdin;
00000000-0000-0000-0000-000000000000	a42f3961-22a6-4a52-9ded-8f6230b5329c	authenticated	authenticated	rahul@pnut.moster	$2a$10$Duq47/.x13ujA301KMfk9OrW.WCzG2fHPUZMIh4bj6ILTmJjGbkh.	2026-03-05 04:50:27.576923+00	\N		\N		2026-03-05 05:02:14.209059+00			\N	2026-03-05 05:02:52.199091+00	{"provider": "email", "providers": ["email"]}	{"sub": "a42f3961-22a6-4a52-9ded-8f6230b5329c", "email": "rahul@pnut.moster", "email_verified": true, "phone_verified": false}	\N	2026-03-05 04:50:27.546038+00	2026-03-05 05:02:52.202991+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	75d4766d-5355-4b0b-8243-330760501584	authenticated	authenticated	admin@pnut.monster	$2a$10$4T6jJ8EkJejf7lWt7QzUouoY0PWH5hDVil/XOTGrJCinThdndMYWO	2026-03-05 06:00:29.566611+00	\N		\N		\N			\N	2026-03-06 17:52:33.464372+00	{"provider": "email", "providers": ["email"]}	{"full_name": "Admin User", "email_verified": true}	\N	2026-03-05 06:00:29.536421+00	2026-03-06 20:17:17.662323+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	e2e6c9e1-79e1-4f2e-a507-efd2bb62b1bd	authenticated	authenticated	test@example.com	$2a$10$u7TWqUVf15sQ/IdKlbm9WuFlZq/XcQ6qV879u6xRZk2H2/Lb05L66	2026-03-05 05:27:00.367253+00	\N		\N	42b5ac5364698705bb595519e328008456eb1983c942767fd0652d0d	2026-03-05 05:27:00.436072+00			\N	2026-03-05 05:27:00.382757+00	{"provider": "email", "providers": ["email"]}	{"sub": "e2e6c9e1-79e1-4f2e-a507-efd2bb62b1bd", "email": "test@example.com", "email_verified": true, "phone_verified": false}	\N	2026-03-05 05:27:00.355804+00	2026-03-05 05:27:00.440544+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	0d6797fd-06c5-41c2-b15e-146cf8813b9f	authenticated	authenticated	staff@koramangala.pnut.monster	$2a$10$4T.4uTlLP0VfIbhd6TBFl.NbjU3KCsU55.Olf6a1VNqcDlJ7gFlNa	2026-03-05 04:55:20.915353+00	\N		\N		\N			\N	\N	{"provider": "email", "providers": ["email"]}	{"full_name": "Koramangala Staff", "email_verified": true}	\N	2026-03-05 04:55:20.907633+00	2026-03-05 04:55:20.91634+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	9c9fb404-da5d-44b3-949f-1187d9f9b4b2	authenticated	authenticated	customer@pnutmonster.com	$2a$10$1SjY2F2jz/l7FbTzB.zDxeVUXzrzwzLLdmV.16g53SoCjmJxQVxsq	2026-04-10 06:22:40.315721+00	\N		\N	7f6c35ce3b7de2558d767091932171d65e182a2b5c1512bb841ee9e6	2026-04-10 06:36:54.771663+00			\N	\N	{"provider": "email", "providers": ["email"]}	{"full_name": "Test Customer", "email_verified": true}	\N	2026-04-10 06:22:40.308761+00	2026-04-10 06:36:54.781733+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	ed2c107b-ffeb-4225-8b7d-cf59f3c6d998	authenticated	authenticated	rudrakakkar26@gmail.com	$2a$10$rIdRzEjgjxCvHOhyVWanROJ.ChhKb4p2f/8upq4Y9DzzHkIBTAB4q	2026-03-12 06:15:15.412195+00	\N		\N		2026-03-12 06:15:54.045669+00			\N	2026-03-12 06:16:19.597629+00	{"provider": "email", "providers": ["email"]}	{"sub": "ed2c107b-ffeb-4225-8b7d-cf59f3c6d998", "email": "rudrakakkar26@gmail.com", "email_verified": true, "phone_verified": false}	\N	2026-03-12 06:15:15.353203+00	2026-03-12 07:14:56.703438+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	9774858f-6e0c-4fd6-adc6-16a60b95ed23	authenticated	authenticated	rahul@pnut.monster	$2a$10$5FSStpcGgqArd.IkkLqfxeTk7w5sk2EDuNPtB5Er7W/T6sPkDHCEG	2026-03-05 05:23:42.479449+00	\N		\N		2026-04-10 06:39:05.904162+00			\N	2026-04-10 06:39:16.336342+00	{"provider": "email", "providers": ["email"]}	{"sub": "9774858f-6e0c-4fd6-adc6-16a60b95ed23", "email": "rahul@pnut.monster", "email_verified": true, "phone_verified": false}	\N	2026-03-05 05:23:42.466421+00	2026-04-10 06:39:16.33825+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	fd7f5bcd-cea8-460c-b096-78b9fab8e9ac	authenticated	authenticated	admin@pnutmonster.com	$2a$10$O4LmySrvcaxaFFiWB6u.fuWNDzUQWTtIA4EMW/dfRhUJzGwQdhcgK	2026-03-12 06:25:37.470265+00	\N		\N		\N			\N	2026-04-10 06:29:06.696929+00	{"provider": "email", "providers": ["email"]}	{"full_name": "Admin", "email_verified": true}	\N	2026-03-12 06:25:37.461287+00	2026-04-10 06:29:06.702957+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	e78a1d4b-4351-4f07-8034-26e28d7026ed	authenticated	authenticated	staff@pnutmonster.com	$2a$10$EwDaYyH6RhIEvvoV/kMwDOP2HQtYP4V4yTmkm05M0L3PG8u8z7zha	2026-04-10 06:23:14.114571+00	\N		\N		\N			\N	2026-04-10 06:42:05.022064+00	{"provider": "email", "providers": ["email"]}	{"full_name": "Staff User", "email_verified": true}	\N	2026-04-10 06:23:14.111475+00	2026-04-10 06:42:05.023661+00	\N	\N			\N		0	\N		\N	f	\N	f
\.


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE SET; Schema: auth; Owner: -
--

SELECT pg_catalog.setval('auth.refresh_tokens_id_seq', 29, true);


--
-- Name: mfa_amr_claims amr_id_pk; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT amr_id_pk PRIMARY KEY (id);


--
-- Name: audit_log_entries audit_log_entries_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.audit_log_entries
    ADD CONSTRAINT audit_log_entries_pkey PRIMARY KEY (id);


--
-- Name: custom_oauth_providers custom_oauth_providers_identifier_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.custom_oauth_providers
    ADD CONSTRAINT custom_oauth_providers_identifier_key UNIQUE (identifier);


--
-- Name: custom_oauth_providers custom_oauth_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.custom_oauth_providers
    ADD CONSTRAINT custom_oauth_providers_pkey PRIMARY KEY (id);


--
-- Name: flow_state flow_state_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.flow_state
    ADD CONSTRAINT flow_state_pkey PRIMARY KEY (id);


--
-- Name: identities identities_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_pkey PRIMARY KEY (id);


--
-- Name: identities identities_provider_id_provider_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_provider_id_provider_unique UNIQUE (provider_id, provider);


--
-- Name: instances instances_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.instances
    ADD CONSTRAINT instances_pkey PRIMARY KEY (id);


--
-- Name: mfa_amr_claims mfa_amr_claims_session_id_authentication_method_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT mfa_amr_claims_session_id_authentication_method_pkey UNIQUE (session_id, authentication_method);


--
-- Name: mfa_challenges mfa_challenges_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_pkey PRIMARY KEY (id);


--
-- Name: mfa_factors mfa_factors_last_challenged_at_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_last_challenged_at_key UNIQUE (last_challenged_at);


--
-- Name: mfa_factors mfa_factors_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_pkey PRIMARY KEY (id);


--
-- Name: oauth_authorizations oauth_authorizations_authorization_code_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_authorization_code_key UNIQUE (authorization_code);


--
-- Name: oauth_authorizations oauth_authorizations_authorization_id_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_authorization_id_key UNIQUE (authorization_id);


--
-- Name: oauth_authorizations oauth_authorizations_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_pkey PRIMARY KEY (id);


--
-- Name: oauth_client_states oauth_client_states_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_client_states
    ADD CONSTRAINT oauth_client_states_pkey PRIMARY KEY (id);


--
-- Name: oauth_clients oauth_clients_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_clients
    ADD CONSTRAINT oauth_clients_pkey PRIMARY KEY (id);


--
-- Name: oauth_consents oauth_consents_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_pkey PRIMARY KEY (id);


--
-- Name: oauth_consents oauth_consents_user_client_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_user_client_unique UNIQUE (user_id, client_id);


--
-- Name: one_time_tokens one_time_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.one_time_tokens
    ADD CONSTRAINT one_time_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_token_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_unique UNIQUE (token);


--
-- Name: saml_providers saml_providers_entity_id_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_entity_id_key UNIQUE (entity_id);


--
-- Name: saml_providers saml_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_pkey PRIMARY KEY (id);


--
-- Name: saml_relay_states saml_relay_states_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: sso_domains sso_domains_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_domains
    ADD CONSTRAINT sso_domains_pkey PRIMARY KEY (id);


--
-- Name: sso_providers sso_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_providers
    ADD CONSTRAINT sso_providers_pkey PRIMARY KEY (id);


--
-- Name: users users_phone_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_phone_key UNIQUE (phone);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: audit_logs_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX audit_logs_instance_id_idx ON auth.audit_log_entries USING btree (instance_id);


--
-- Name: confirmation_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX confirmation_token_idx ON auth.users USING btree (confirmation_token) WHERE ((confirmation_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: custom_oauth_providers_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX custom_oauth_providers_created_at_idx ON auth.custom_oauth_providers USING btree (created_at);


--
-- Name: custom_oauth_providers_enabled_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX custom_oauth_providers_enabled_idx ON auth.custom_oauth_providers USING btree (enabled);


--
-- Name: custom_oauth_providers_identifier_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX custom_oauth_providers_identifier_idx ON auth.custom_oauth_providers USING btree (identifier);


--
-- Name: custom_oauth_providers_provider_type_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX custom_oauth_providers_provider_type_idx ON auth.custom_oauth_providers USING btree (provider_type);


--
-- Name: email_change_token_current_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX email_change_token_current_idx ON auth.users USING btree (email_change_token_current) WHERE ((email_change_token_current)::text !~ '^[0-9 ]*$'::text);


--
-- Name: email_change_token_new_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX email_change_token_new_idx ON auth.users USING btree (email_change_token_new) WHERE ((email_change_token_new)::text !~ '^[0-9 ]*$'::text);


--
-- Name: factor_id_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX factor_id_created_at_idx ON auth.mfa_factors USING btree (user_id, created_at);


--
-- Name: flow_state_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX flow_state_created_at_idx ON auth.flow_state USING btree (created_at DESC);


--
-- Name: identities_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX identities_email_idx ON auth.identities USING btree (email text_pattern_ops);


--
-- Name: INDEX identities_email_idx; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON INDEX auth.identities_email_idx IS 'Auth: Ensures indexed queries on the email column';


--
-- Name: identities_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX identities_user_id_idx ON auth.identities USING btree (user_id);


--
-- Name: idx_auth_code; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_auth_code ON auth.flow_state USING btree (auth_code);


--
-- Name: idx_oauth_client_states_created_at; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_oauth_client_states_created_at ON auth.oauth_client_states USING btree (created_at);


--
-- Name: idx_user_id_auth_method; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_user_id_auth_method ON auth.flow_state USING btree (user_id, authentication_method);


--
-- Name: mfa_challenge_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX mfa_challenge_created_at_idx ON auth.mfa_challenges USING btree (created_at DESC);


--
-- Name: mfa_factors_user_friendly_name_unique; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX mfa_factors_user_friendly_name_unique ON auth.mfa_factors USING btree (friendly_name, user_id) WHERE (TRIM(BOTH FROM friendly_name) <> ''::text);


--
-- Name: mfa_factors_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX mfa_factors_user_id_idx ON auth.mfa_factors USING btree (user_id);


--
-- Name: oauth_auth_pending_exp_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_auth_pending_exp_idx ON auth.oauth_authorizations USING btree (expires_at) WHERE (status = 'pending'::auth.oauth_authorization_status);


--
-- Name: oauth_clients_deleted_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_clients_deleted_at_idx ON auth.oauth_clients USING btree (deleted_at);


--
-- Name: oauth_consents_active_client_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_active_client_idx ON auth.oauth_consents USING btree (client_id) WHERE (revoked_at IS NULL);


--
-- Name: oauth_consents_active_user_client_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_active_user_client_idx ON auth.oauth_consents USING btree (user_id, client_id) WHERE (revoked_at IS NULL);


--
-- Name: oauth_consents_user_order_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_user_order_idx ON auth.oauth_consents USING btree (user_id, granted_at DESC);


--
-- Name: one_time_tokens_relates_to_hash_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX one_time_tokens_relates_to_hash_idx ON auth.one_time_tokens USING hash (relates_to);


--
-- Name: one_time_tokens_token_hash_hash_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX one_time_tokens_token_hash_hash_idx ON auth.one_time_tokens USING hash (token_hash);


--
-- Name: one_time_tokens_user_id_token_type_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX one_time_tokens_user_id_token_type_key ON auth.one_time_tokens USING btree (user_id, token_type);


--
-- Name: reauthentication_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX reauthentication_token_idx ON auth.users USING btree (reauthentication_token) WHERE ((reauthentication_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: recovery_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX recovery_token_idx ON auth.users USING btree (recovery_token) WHERE ((recovery_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: refresh_tokens_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_instance_id_idx ON auth.refresh_tokens USING btree (instance_id);


--
-- Name: refresh_tokens_instance_id_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_instance_id_user_id_idx ON auth.refresh_tokens USING btree (instance_id, user_id);


--
-- Name: refresh_tokens_parent_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_parent_idx ON auth.refresh_tokens USING btree (parent);


--
-- Name: refresh_tokens_session_id_revoked_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_session_id_revoked_idx ON auth.refresh_tokens USING btree (session_id, revoked);


--
-- Name: refresh_tokens_updated_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_updated_at_idx ON auth.refresh_tokens USING btree (updated_at DESC);


--
-- Name: saml_providers_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_providers_sso_provider_id_idx ON auth.saml_providers USING btree (sso_provider_id);


--
-- Name: saml_relay_states_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_created_at_idx ON auth.saml_relay_states USING btree (created_at DESC);


--
-- Name: saml_relay_states_for_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_for_email_idx ON auth.saml_relay_states USING btree (for_email);


--
-- Name: saml_relay_states_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_sso_provider_id_idx ON auth.saml_relay_states USING btree (sso_provider_id);


--
-- Name: sessions_not_after_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_not_after_idx ON auth.sessions USING btree (not_after DESC);


--
-- Name: sessions_oauth_client_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_oauth_client_id_idx ON auth.sessions USING btree (oauth_client_id);


--
-- Name: sessions_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_user_id_idx ON auth.sessions USING btree (user_id);


--
-- Name: sso_domains_domain_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX sso_domains_domain_idx ON auth.sso_domains USING btree (lower(domain));


--
-- Name: sso_domains_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sso_domains_sso_provider_id_idx ON auth.sso_domains USING btree (sso_provider_id);


--
-- Name: sso_providers_resource_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX sso_providers_resource_id_idx ON auth.sso_providers USING btree (lower(resource_id));


--
-- Name: sso_providers_resource_id_pattern_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sso_providers_resource_id_pattern_idx ON auth.sso_providers USING btree (resource_id text_pattern_ops);


--
-- Name: unique_phone_factor_per_user; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX unique_phone_factor_per_user ON auth.mfa_factors USING btree (user_id, phone);


--
-- Name: user_id_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX user_id_created_at_idx ON auth.sessions USING btree (user_id, created_at);


--
-- Name: users_email_partial_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX users_email_partial_key ON auth.users USING btree (email) WHERE (is_sso_user = false);


--
-- Name: INDEX users_email_partial_key; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON INDEX auth.users_email_partial_key IS 'Auth: A partial unique index that applies only when is_sso_user is false';


--
-- Name: users_instance_id_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_instance_id_email_idx ON auth.users USING btree (instance_id, lower((email)::text));


--
-- Name: users_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_instance_id_idx ON auth.users USING btree (instance_id);


--
-- Name: users_is_anonymous_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_is_anonymous_idx ON auth.users USING btree (is_anonymous);


--
-- Name: users on_auth_user_created; Type: TRIGGER; Schema: auth; Owner: -
--

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


--
-- Name: identities identities_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: mfa_amr_claims mfa_amr_claims_session_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT mfa_amr_claims_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;


--
-- Name: mfa_challenges mfa_challenges_auth_factor_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_auth_factor_id_fkey FOREIGN KEY (factor_id) REFERENCES auth.mfa_factors(id) ON DELETE CASCADE;


--
-- Name: mfa_factors mfa_factors_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: oauth_authorizations oauth_authorizations_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: oauth_authorizations oauth_authorizations_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: oauth_consents oauth_consents_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: oauth_consents oauth_consents_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: one_time_tokens one_time_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.one_time_tokens
    ADD CONSTRAINT one_time_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_session_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;


--
-- Name: saml_providers saml_providers_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: saml_relay_states saml_relay_states_flow_state_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_flow_state_id_fkey FOREIGN KEY (flow_state_id) REFERENCES auth.flow_state(id) ON DELETE CASCADE;


--
-- Name: saml_relay_states saml_relay_states_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_oauth_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_oauth_client_id_fkey FOREIGN KEY (oauth_client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: sso_domains sso_domains_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_domains
    ADD CONSTRAINT sso_domains_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: audit_log_entries; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.audit_log_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: flow_state; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.flow_state ENABLE ROW LEVEL SECURITY;

--
-- Name: identities; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.identities ENABLE ROW LEVEL SECURITY;

--
-- Name: instances; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.instances ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_amr_claims; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_amr_claims ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_challenges; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_challenges ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_factors; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_factors ENABLE ROW LEVEL SECURITY;

--
-- Name: one_time_tokens; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.one_time_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: refresh_tokens; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.refresh_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: saml_providers; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.saml_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: saml_relay_states; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.saml_relay_states ENABLE ROW LEVEL SECURITY;

--
-- Name: schema_migrations; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.schema_migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: sessions; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: sso_domains; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sso_domains ENABLE ROW LEVEL SECURITY;

--
-- Name: sso_providers; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sso_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

