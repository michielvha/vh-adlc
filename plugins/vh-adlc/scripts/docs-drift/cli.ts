#!/usr/bin/env bun
import { withRuntimeValidation } from "./bootstrap";
import { runDirectoryMain } from "./run-cli";

export async function main(argv: string[]): Promise<number> {
  return withRuntimeValidation(() => runDirectoryMain(argv));
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
