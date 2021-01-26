/* eslint-disable class-methods-use-this */
import { BlockGetCommand } from 'lisk-commander';
import { Application, PartialApplicationConfig } from 'lisk-sdk';
import { getApplication } from '../../app/app';

export class GetCommand extends BlockGetCommand {
	static flags = {
		...BlockGetCommand.flags,
	};

	static args = [...BlockGetCommand.args];

	public getApplication(
		genesisBlock: Record<string, unknown>,
		config: PartialApplicationConfig,
	): Application {
		const app = getApplication(genesisBlock, config);
		return app;
	}
}