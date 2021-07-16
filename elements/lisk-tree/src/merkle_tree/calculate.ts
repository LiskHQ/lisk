import { hash } from "../../../lisk-cryptography/dist-node";
import { LEAF_PREFIX, NODE_HASH_SIZE } from "./constants";
import { NodeIndex, NodeInfo, NodeLocation, NodeSide, NonNullableStruct, Proof, SiblingHash } from "./types";
import { buildBranch, createNewBranchNode, createNewLeafNode, generateNode, getBinaryString,
    getHeight, getPairLocation, getParentLocation, isLocationEqualToSiblingHash } from "./utils";

export const calculatePathNodes = (
    queryData: ReadonlyArray<Buffer>,
    size: number,
    idxs: ReadonlyArray<NodeIndex>,
    siblingHashes: ReadonlyArray<SiblingHash>) => {
    if (queryData.length !== idxs.length) {
        throw new Error('Amount of query hashes doesn\'t match amount of indexes');
    }

    if (queryData.length === 0 && idxs.length === 0) {
        throw new Error('No data is provided')
    }

    const pairHashes = siblingHashes.map(siblingHash => ({ ...siblingHash }));
    
    const tree: Record<string, NodeInfo> = {};
    
    const locations = idxs.map(idx => ({ ...idx }));
    for (const [i, location] of Object.entries(locations)) {
        const currentQueryDataIndex = Number(i);
        const {
            nodeIndex: currentNodeIndex,
            layerIndex: currentLayerIndex,
        } = location;

        if (currentLayerIndex === undefined || currentNodeIndex === undefined) {
            locations.shift();
            continue;
        }

        const value = queryData[currentQueryDataIndex];

        const binaryIndex = getBinaryString(currentNodeIndex, getHeight(size) - currentLayerIndex).toString();
        const isCurrentQueryDataLeaf = currentLayerIndex === 0;

        let newNode;
        if (isCurrentQueryDataLeaf) {
            newNode = createNewLeafNode(value, currentNodeIndex, true);
        } else {
            const rightHash = value.slice(-1 * NODE_HASH_SIZE);
            const leftHash = value.slice(-2 * NODE_HASH_SIZE, -1 * NODE_HASH_SIZE);
            const newNodeData = buildBranch(leftHash, rightHash, currentLayerIndex, currentNodeIndex);
            newNode = generateNode(newNodeData.branchHash, newNodeData.branchValue);
        }

        tree[binaryIndex] = newNode;
    }

    while (locations[0].layerIndex as number < getHeight(size) - 1) {
        const location = locations[0] as NonNullableStruct<NodeIndex>;
        const {
            nodeIndex: currentNodeIndex,
            layerIndex: currentLayerIndex,
        } = location;

        const binaryIndex = getBinaryString(currentNodeIndex, getHeight(size) - currentLayerIndex).toString();
        const currentNode = tree[binaryIndex];

        const pairLocation = getPairLocation({
            layerIndex: currentLayerIndex,
            nodeIndex: currentNodeIndex,
            size,
        });
        const {
            layerIndex: pairLayerIndex,
            nodeIndex: pairNodeIndex,
            side: pairSide,
        } = pairLocation;
        const pairBinaryIndex = getBinaryString(pairNodeIndex, getHeight(size) - pairLayerIndex).toString();

        const parentLocation: NodeLocation = getParentLocation(location, pairLocation);
        const {
            layerIndex: parentLayerIndex,
            nodeIndex: parentNodeIndex,
        } = parentLocation;
        const parentBinaryIndex = getBinaryString(parentNodeIndex, getHeight(size) - parentLayerIndex).toString();

        const currentSiblingHash = pairHashes[0];
        if (currentSiblingHash && !isLocationEqualToSiblingHash(pairLocation, currentSiblingHash) &&
        !isLocationEqualToSiblingHash(location, currentSiblingHash)) {
            // const leftHashBuffer = pairSide === NodeSide.LEFT ? tree[pairBinaryIndex].hash : currentNode.hash;
            // const rightHashBuffer = pairSide === NodeSide.RIGHT ? tree[pairBinaryIndex].hash : currentNode.hash;
            // const newParentNodeData = buildBranch(leftHashBuffer, rightHashBuffer, parentLayerIndex, parentNodeIndex);
            const newParentNode = createNewBranchNode(parentLocation, tree[pairBinaryIndex].hash, currentNode.hash, pairSide as NodeSide);
    
            
            if (!tree[parentBinaryIndex]) {
                tree[parentBinaryIndex] = newParentNode;
                locations.push(parentLocation);
            }

            locations.shift();
            continue;
        }

        let pairNodeHash;
        if(tree[pairBinaryIndex]) {
            pairNodeHash = tree[pairBinaryIndex].hash;
        } else {
            pairNodeHash = pairHashes[0].hash;
            pairHashes.shift();
        }


        // const leftHashBuffer = pairSide === NodeSide.LEFT ? pairNodeHash : currentNode.hash;
        // const rightHashBuffer = pairSide === NodeSide.RIGHT ? pairNodeHash : currentNode.hash;
        // const newParentNodeData = buildBranch(leftHashBuffer, rightHashBuffer, parentLayerIndex, parentNodeIndex);
        // const newParentNode = generateNode(newParentNodeData.branchHash, newParentNodeData.branchValue);
        const newParentNode = createNewBranchNode(parentLocation, pairNodeHash, currentNode.hash, pairSide as NodeSide);
        
        if (!tree[parentBinaryIndex]) {
            tree[parentBinaryIndex] = newParentNode;
            locations.push(parentLocation);
        }

        locations.shift();
    }

    return tree;
}

export const calculateRootFromUpdateData = (
	updateData: Buffer[],
	proof: Proof,
) => {
	const { indexes, size, siblingHashes } = proof;

	if (updateData.length !== indexes.length) {
		throw new Error('Amount of update data doesn\'t match amount of indexes');
	}

    const updateHashes = [];

    for (const data of updateData) {
        const leafValueWithoutNodeIndex = Buffer.concat(
            [LEAF_PREFIX, data],
            LEAF_PREFIX.length + data.length,
        );
        const leafHash = hash(leafValueWithoutNodeIndex);
        updateHashes.push(leafHash);
    }

	const calculatedTree = calculatePathNodes(updateHashes, size, indexes, siblingHashes as SiblingHash[]);
	const calculatedRoot = calculatedTree['0'].hash;

	return calculatedRoot;
}