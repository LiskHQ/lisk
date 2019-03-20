const Bignumber = require('bignumber.js');

const { TRANSACTION_TYPES } = global.constants;

const updateRoundInformationWithDelegatesForTransaction = function(
	stateStore,
	transaction,
	forwardTick
) {
	if (transaction.type === TRANSACTION_TYPES.VOTE) {
		(forwardTick
			? transaction.asset.votes
			: reverse(transaction.asset.votes)
		)
			.map(vote => {
				// Fetch first character
				const mode = vote[0];
				const dependentId = vote.slice(1);
				const balanceFactor = mode === '-' ? -1 : 1;
				const account = stateStore.account.get(transaction.senderId);

				const balance = new Bignumber(account.balance)
					.multipliedBy(balanceFactor)
					.toString();

				const roundData = {
					address: transaction.senderId,
					delegatePublicKey: dependentId,
					amount: balance,
				};

				return roundData;
			})
			.map(data => stateStore.round.add(data));
	}
};

const updateSenderRoundInformationWithAmountForTransaction = function(
	stateStore,
	transaction,
	forwardTick
) {
	const value = new Bignumber(transaction.fee).plus(transaction.amount);
	const valueToUpdate = forwardTick
		? value.multipliedBy(-1).toString()
		: value.toString();
	const account = stateStore.account.get(transaction.senderId);
	let dependentPublicKeysToAdd = account.votedDelegatesPublicKeys || [];

	if (transaction.type === TRANSACTION_TYPES.VOTE) {
		const newVotes = forwardTick
			? transaction.asset.votes
			: reverse(transaction.asset.votes);
		const downvotes = newVotes
			.filter(vote => vote[0] === '-')
			.map(vote => vote.slice(1));
		const upvotes = newVotes
			.filter(vote => vote[0] === '+')
			.map(vote => vote.slice(1));
		dependentPublicKeysToAdd = dependentPublicKeysToAdd.filter(
			vote => !upvotes.find(v => v === vote)
		);
		dependentPublicKeysToAdd = dependentPublicKeysToAdd.concat(downvotes);
	}

	if (dependentPublicKeysToAdd.length > 0) {
		dependentPublicKeysToAdd
			.map(delegatePublicKey => ({
				address: transaction.senderId,
				amount: valueToUpdate,
				delegatePublicKey,
			}))
			.map(data => stateStore.round.add(data));
	}
};

const updateRecipientRoundInformationWithAmountForTransaction = function(
	stateStore,
	transaction,
	forwardTick
) {
	let address;
	if (transaction.type === TRANSACTION_TYPES.IN_TRANSFER) {
		const dappTransaction = stateStore.transaction.get(
			transaction.asset.inTrasfer.dappId
		);
		address = dappTransaction.senderId;
	}
	if (
		transaction.type === TRANSACTION_TYPES.SEND ||
		transaction.type === TRANSACTION_TYPES.OUT_TRANSFER
	) {
		address = transaction.recipientId;
	}

	if (address) {
		const account = stateStore.account.get(address);
		const value = new Bignumber(transaction.amount);
		const valueToUpdate = forwardTick
			? value.toString()
			: value.multipliedBy(-1).toString();
		if (account.votedDelegatesPublicKeys) {
			account.votedDelegatesPublicKeys
				.map(delegatePublicKey => ({
					address,
					amount: valueToUpdate,
					delegatePublicKey,
				}))
				.map(data => stateStore.round.add(data));
		}
	}
};

const reverse = function(diff) {
	const copyDiff = diff.slice();
	for (let i = 0; i < copyDiff.length; i++) {
		const math = copyDiff[i][0] === '-' ? '+' : '-';
		copyDiff[i] = math + copyDiff[i].slice(1);
	}
	return copyDiff;
};

module.exports = {
	apply(stateStore, transaction) {
		const isForwardTick = true;
		updateRecipientRoundInformationWithAmountForTransaction(
			stateStore,
			transaction,
			isForwardTick
		);
		updateSenderRoundInformationWithAmountForTransaction(
			stateStore,
			transaction,
			isForwardTick
		);
		updateRoundInformationWithDelegatesForTransaction(
			stateStore,
			transaction,
			isForwardTick
		);
	},

	undo(stateStore, transaction) {
		const isForwardTick = false;
		updateRecipientRoundInformationWithAmountForTransaction(
			stateStore,
			transaction,
			isForwardTick
		);
		updateSenderRoundInformationWithAmountForTransaction(
			stateStore,
			transaction,
			isForwardTick
		);
		updateRoundInformationWithDelegatesForTransaction(
			stateStore,
			transaction,
			isForwardTick
		);
	},
};
