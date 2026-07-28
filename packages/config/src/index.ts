/**
 * Shared build configuration and the validated runtime environment.
 *
 * `tsconfig.base.json` is consumed via the `./tsconfig.base.json` export; this
 * entrypoint is the runtime half.
 */

export {
  envSchema,
  loadEnv,
  loadEnvOrExit,
  isSecretVariable,
  EnvironmentError,
  ENV_VARIABLE_NAMES,
  type Env,
  type NodeEnvironment,
  type LogLevel,
} from "./env.js";
