/* eslint-disable class-methods-use-this */
import { AccountGetCommand } from 'lisk-commander';
import { Application, PartialApplicationConfig } from 'lisk-sdk';
import { getApplication } from '../../app/app';

export class GetCommand extends AccountGetCommand {
	static flags = {
		...AccountGetCommand.flags,
	};

	static args = [...AccountGetCommand.args];
	public getApplication(
		genesisBlock: Record<string, unknown>,
		config: PartialApplicationConfig,
	): Application {
		const app = getApplication(genesisBlock, config);
		return app;
	}
}