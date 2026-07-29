import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { Sql } from "postgres";
import { createClient } from "../client.js";
import { createDatabase, type Database } from "../tenant-context.js";
import { migrateUp } from "../migrate.js";

/**
 * Integration-test harness: a real Postgres, migrated, with two connections.
 *
 * The two connections are the whole point.
 *
 * Testcontainers' default user is a SUPERUSER, and **a superuser bypasses RLS
 * unconditionally** — `FORCE ROW LEVEL SECURITY` does not apply to it, and
 * nothing you can write in a policy will. An isolation suite run on the default
 * connection passes no matter how broken the policies are, which is the most
 * dangerous kind of green test: it asserts the exact thing it cannot see.
 *
 * So `owner` runs migrations, and `app` — an ordinary LOGIN role granted
 * `atelier_app` — is what every isolation assertion goes through.
 */

export const POSTGRES_IMAGE = "postgres:17-alpine";

const APP_USER = "atelier_app_login";
const APP_PASSWORD = "atelier_test_password";
const AUTH_USER = "atelier_auth_login";
const AUTH_PASSWORD = "atelier_test_password";

export type Harness = {
  container: StartedPostgreSqlContainer;
  /** Superuser. Migrations and fixture setup only — bypasses RLS. */
  owner: Sql;
  /** Ordinary role. Subject to RLS; every isolation assertion uses this. */
  app: Sql;
  /** Drizzle handle over `app` — what withTenant() takes. */
  appDb: Database;
  /**
   * Ordinary role holding `atelier_auth` (ADR-010).
   *
   * Present so the suite can assert what this role CANNOT do. That is the
   * assertion that matters: a role-scoped policy granting identity access is
   * exactly the kind of control that looks correct and does nothing, and a test
   * proving only that auth can read `users` would pass identically if the role
   * were a superuser.
   */
  auth: Sql;
  stop: () => Promise<void>;
};

export async function startHarness(): Promise<Harness> {
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();

  const owner = createClient({ connectionString: container.getConnectionUri(), max: 4 });
  await migrateUp(owner);

  // A login role that HAS atelier_app rather than being it: `atelier_app` is
  // NOLOGIN by design (see the migration), so tests grant it the same way ops
  // would, instead of the migration shipping a password.
  await owner.unsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_USER}') THEN
        CREATE ROLE ${APP_USER} LOGIN PASSWORD '${APP_PASSWORD}';
      END IF;
    END
    $$;
    GRANT atelier_app TO ${APP_USER};
  `);

  await owner.unsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${AUTH_USER}') THEN
        CREATE ROLE ${AUTH_USER} LOGIN PASSWORD '${AUTH_PASSWORD}';
      END IF;
    END
    $$;
    GRANT atelier_auth TO ${AUTH_USER};
  `);

  const connectAs = (user: string, password: string): Sql => {
    const uri = new URL(container.getConnectionUri());
    uri.username = user;
    uri.password = password;
    return createClient({ connectionString: uri.href, max: 4 });
  };

  const app = connectAs(APP_USER, APP_PASSWORD);
  const auth = connectAs(AUTH_USER, AUTH_PASSWORD);

  // Guard the guard: if either role were a superuser the entire suite would be
  // meaningless, so assert it rather than assume it.
  for (const [label, connection] of [
    ["application", app],
    ["authentication", auth],
  ] as const) {
    const [role] = await connection<{ is_superuser: boolean }[]>`
      SELECT rolsuper AS is_superuser FROM pg_roles WHERE rolname = current_user
    `;
    if (role?.is_superuser !== false) {
      throw new Error(
        `The ${label} test role is a superuser. RLS assertions would pass vacuously.`,
      );
    }
  }

  return {
    container,
    owner,
    app,
    appDb: createDatabase(app),
    auth,
    stop: async () => {
      await auth.end({ timeout: 5 });
      await app.end({ timeout: 5 });
      await owner.end({ timeout: 5 });
      await container.stop();
    },
  };
}

/** Insert fixture rows as the owner, bypassing RLS so the test can then be denied them. */
export async function seedOrganization(
  owner: Sql,
  options: { id: string; slug: string; name?: string },
): Promise<void> {
  await owner`
    INSERT INTO organizations (id, slug, name)
    VALUES (${options.id}, ${options.slug}, ${options.name ?? options.slug})
  `;
}

export async function seedUserWithMembership(
  owner: Sql,
  options: { userId: string; email: string; organizationId: string; membershipId: string },
): Promise<void> {
  await owner`INSERT INTO users (id, email) VALUES (${options.userId}, ${options.email})`;
  await owner`
    INSERT INTO memberships (id, organization_id, user_id, role)
    VALUES (${options.membershipId}, ${options.organizationId}, ${options.userId}, 'member')
  `;
}
