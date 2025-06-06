import type yargs from 'yargs';

import { evaluateHandler } from './eval';
import builders from '../../builders';
import type { YargsArgs } from '../../types/yargs';

const command = {
  command: ['eval', 'e'],
  desc: 'Attempt to evaluate snap bundle in SES',
  builder: (yarg: yargs.Argv) => {
    yarg.option('input', builders.input);
  },
  handler: async (argv: YargsArgs) =>
    evaluateHandler(argv.context.config, { input: argv.input }),
};

export * from './implementation';
export default command;
