import { gitEnvironment, readGitWithEnvironment as nativeGit } from "../git-read";
import { createYAMLReader } from "../settings-file";
import type { CollectionReaders } from "../docs-impact/collection";

type Environment = Readonly<Record<string, string | undefined>>;

function ordinaryGitEnvironment(base: Environment): Record<string, string | undefined> {
  return {
    PATH: base.PATH ?? "/usr/bin:/bin", LANG: "C", LC_ALL: "C",
    ...(base.TMPDIR === undefined ? {} : { TMPDIR: base.TMPDIR }),
    GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
  };
}

/** An unsupported capability fails at option parsing, before Git can read or repair an object. */
export function readGit(repo: string, ...args: string[]): Buffer {
  return readGitWithEnvironment(repo, args, { PATH: process.env.PATH });
}

export function readGitWithEnvironment(repo: string, args: string[], environment: Environment): Buffer {
  return nativeGit(repo, [
    "--no-lazy-fetch", "--no-replace-objects", "-c", "credential.helper=", "-c", "http.extraHeader=",
    "-c", "core.hooksPath=/dev/null", ...args,
  ], ordinaryGitEnvironment(environment));
}

/** The verified binary needs its normal cache location. Credential values and hooks stay excluded. */
export function verifiedHelperEnvironment(): Record<string, string | undefined> {
  return {
    ...gitEnvironment(ordinaryGitEnvironment({ PATH: process.env.PATH })),
    HOME: process.env.HOME, XDG_CACHE_HOME: process.env.XDG_CACHE_HOME,
    GIT_CONFIG_COUNT: "3", GIT_CONFIG_KEY_0: "core.fsmonitor", GIT_CONFIG_VALUE_0: "false",
    GIT_CONFIG_KEY_1: "credential.helper", GIT_CONFIG_VALUE_1: "",
    GIT_CONFIG_KEY_2: "http.extraHeader", GIT_CONFIG_VALUE_2: "",
  };
}

export function collectionReaders() {
  let yaml: ((bytes: Uint8Array) => unknown) | undefined;
  return {
    git: readGit,
    yaml: (bytes: Uint8Array): unknown => {
      yaml ??= createYAMLReader(reason => { throw new Error(reason); }, { offline: true, environment: verifiedHelperEnvironment() });
      return yaml(bytes);
    },
  } satisfies CollectionReaders;
}
