// @vitest-environment node
import { runExportIntegrity } from './__kernel-tests__/exportIntegrityRunner';
import { holders } from './scenarios/holders';

runExportIntegrity(holders);
