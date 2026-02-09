#!/usr/bin/env node

/**
 * UBP CLI エントリポイント
 */

import { createCli } from './interface/cli/index.js';

const program = createCli();
program.parse(process.argv);
