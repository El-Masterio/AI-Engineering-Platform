/**
 * Pure business logic and domain entities. ZERO external dependencies by design
 * (ADR-001, §19) — verified by dependency-cruiser and by the boundaries lint
 * rule, not by convention.
 *
 * Everything here is immutable and side-effect free. Time arrives through the
 * clock port; nothing calls `Date.now()`, and the lint rules make that
 * impossible rather than discouraged (§21).
 */

export const PACKAGE_NAME = "@atelier/domain" as const;

export {
  DomainError,
  isDomainError,
  DOMAIN_ERROR_CODES,
  type DomainErrorCode,
} from "./errors/domain-error.js";

export { toTimestamp, fixedClock, type Clock, type Timestamp } from "./ports/clock.port.js";

export {
  createOrganization,
  renameOrganization,
  changePlan,
  archiveOrganization,
  restoreOrganization,
  isArchived,
  isValidSlug,
  assertValidSlug,
  assertValidName,
  ORGANIZATION_PLANS,
  type Organization,
  type OrganizationPlan,
  type CreateOrganizationInput,
} from "./organizations/organization.js";

export {
  inviteMember,
  acceptInvitation,
  changeRole,
  removeMember,
  transferOwnership,
  ownersOf,
  canManage,
  isAccepted,
  isValidRole,
  assertValidRole,
  MEMBERSHIP_ROLES,
  type Membership,
  type MembershipRole,
  type InviteMemberInput,
} from "./organizations/membership.js";

export {
  registerUser,
  verifyEmail,
  changeEmail,
  renameUser,
  normalizeEmail,
  isValidEmail,
  assertValidEmail,
  isEmailVerified,
  type User,
  type RegisterUserInput,
} from "./users/user.js";
