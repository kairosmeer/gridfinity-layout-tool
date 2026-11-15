// @vitest-environment node
import { runExportIntegrity } from './__kernel-tests__/exportIntegrityRunner';
import { raisedFloor } from './scenarios/raisedFloor';

runExportIntegrity(raisedFloor);
