**Sidetree Node.js Implementatipon Document**
===================================================
This document focuses on the Node.js implementation of the Sidetree protocol.

# Overview

![Sidetree Entity Trail diagram](./diagrams/architecture.png)

# Terminology

# DID Cache


# Merkle Rooter

> TODO: to be reviewed and updated.

The rooter handles Create, Update, and Delete operations and anchors them on a blockchain. The pseudo code below assumes that it can interface with CAS (via put operation) and a blockchain (via post operation). The pseudocode currently doesn’t track responses to CRUD operations.

``` javascript
while(true){
	batch = new Batch();
	do{
		op <- recv_sidetree_op() // op is a Create, Update, or Delete operation
		batch.add(txn);
	} while (batch.size() < BATCH_SIZE);

	HashVector hashedTxns = new HashVector();
	foreach transaction t in batch {
		Hash h < -hash(t); // compute a SHA-256 hash of the input
		ipfs.put(h, t); // store transactions in IPFS under their cryptographic hash
		hashedTxns.append(h);
	}

	Hash opHash = hash(hashedTxns);
	ipfs.put(opHash, hashedTxns); // store the array of hashes
	MerkleTree m <- constructMerkleTree(hashedTxns);
	Hash merkleHash = m.root;
	BlockchainTxn btxn = createBlockchainTxn(merkleHash, opHash);
	blockchain.post(btxn);
}
```

# Observer

> TODO: to be reviewed and updated.

The observer watches the public blockchain to identify Sidetree operations, verifying their authenticity, and building a local cache to help a Sidetree node perform resolve operations quickly.

## Walking the Chain

**1**. Secure a copy of the target blockchain and listen for incoming transactions

**2**. Starting at the genesis entry of the blockchain, begin processing the included transactions in order, from earliest to latest.

## Inspecting a Transaction

**3**. For each transaction, inspect the property known to bear the marking of a Sidetree Entity. If the transaction is marked as a Sidetree Entity, continue, if unmarked, move to the next transaction.

**4**. Locate the Merkle Root and hash of the compressed Merkle Leaf file within the transaction.

## Processing the Sidetree

**5**. Fetch the compressed Merkle Leaf source data from the decentralized storage system.

**6**. When the compressed Merkle Leaf source data is inflated to a state that allows for evaluation, begin processing the leaves in index order.

## Evaluating a Leaf

*__If the leaf's Entity object contains just one operation:__*

**7**. The object shall be treated as a new Entity registration.

**8**. Ensure that the entry is signed with the owner's specified key material. If valid, proceed, if invalid, discard the leaf and proceed to the next.

**9**. Generate a state object using the procedural rules in the "Processing Entity Operations" section below, and store the resulting state in cache.

*__If the Entity contains multiple operations:__*

**7**. Retrieve the last Entity state from cache.

**8**. Evaluate the incoming Entity entry to determine if it is a fork, and if the fork supersedes the previously recognized Entity state:

  1) Begin comparing hashes of current Entity state operations against the incoming Entity update's operations at index 0.
  2) If during iteration and comparison of operation hash equality an operation index is found to be divergent from the current Entity state, the incoming Entity represents a fork. Halt iteration and proceed to handle the incoming update as a fork.
  3) The forking operation is valid if it:
      - Includes a valid `proof` that establishes linkage to the last known good operation's Merkle Root.
      - Is signed by keys that were known-valid in the operation index preceding the fork index __OR__ the incoming fork operation contains a valid `recovery` of the Entity. (to assess an operation for recovery, see the section "Evaluating Recovery Attempts")
  4) If the fork is invalid, discard the leaf and proceed to the next. 

**9**. Attempt to update the Entity's state (see "Processing Entity Updates" for rules):

- If the incoming Entity entry is a valid, superseding fork:

    attempt to update the cached Entity's state from the index of the fork's occurrence. If all fork operations are valid and processed without error or violation of protocol rules, save the resulting Entity state to cache, if the fork evaluation fails, discard the leaf and proceed to the next. 

- If the incoming Entity entry is a non-conflicting update:

    Attempt to update the current Entity state from the the first new operation of the incoming Entity entry. If all new update operations are valid and processed without error or violation of protocol rules, save the resulting Entity state to cache, if the fork evaluation fails, discard the leaf and proceed to the next.

## Processing Entity Operations

In order to update an Entity's state with that of an incoming Entity entry, various values and objects must be examined or assembled to validate and merge incoming operations. The following the a series of steps to perform to correctly process, merge, and cache the state of an Entity:

### If processing from 0 index (the initial Entity registration operation) of the Entity object:

**1**. Create and hold an object in memory that will be retained to store the current state of the Entity.

**2**. Store the [DID Version URL](#dids-and-document-version-urls) in the cache object.

**3**. Use the `delta` value of the Entity to create the initial state of the DID Document via the procedure described in [RFC 6902](http://tools.ietf.org/html/rfc6902). Store the compiled DID Document in the cache object. If the delta is not present, abort the process and discard as an invalid DID.

**4**. Verify that the `sig` value is a signature from one of the keys in the compiled DID Document.

**5**. If the `recovery` field is present in the Entity, store any recovery descriptor objects it contains as an array in the cache object.

**6**. Store the source of the Entity in the cache object.

### If processing any operation beyond index 0:

**1**. Validate that the object's proof field is present, and its value is a proof that links to the last operation's transaction root.

**2**. If the field `recover` is present on the Entity, the operation is initiating a recovery of the Entity. Process the value of the `recover` field in accordance with the recovery process defined by the matching `recovery` descriptor. If the recovery attempt is validated against the matching recovery descriptor, proceed. If there is no matching descriptor, or the recovery attempt is found to be invalid, abort, discard the entry, and revert state to last known good.

**3**. If no recovery was attempted, validate the Entity operation `sig` with one of the keys present in the DID Document compiled from the Entity's current state. If a recovery was performed, skip this step and proceed.

**4**. Use the `delta` present to update the compiled DID Document object being held in cache.

**5**. If the `recovery` field is present in the Entity, store any recovery descriptor objects it contains as an array in the cache object.

**6**. Store the source of the new Entity source in the cache object.

## Implementation Pseudo Code

```javascript
function getRootHash(txn){
  // Inspect txn, and if it is a Sidetree-bearing Entity, process the tree 
}
async function getLeafFileHash(txn) {
  // Fetch tree source data from decentralized storage, return array of leaves.
  // If not found warn: "Processing Warning: tree not found"
};
async function getLeafData(leafFileHash) {
  // Fetch and return Entity source data from decentralized storage.
  // If not found warn: "Processing Warning: Entity not found"
};
async function getEntityState(id){ ... };
async function validateOpSig(op) { ... };
async function validateOpProof(entity) { ... };
async function validateFork(state, update, forkIndex) { ... }
async function updateState(state, update, startIndex) { ... }
function mergeDiff(doc, diff) { ... };
function generateOpHash(op){ ... }


function processTransaction(txn){
  var rootHash = getRootHash(txn);
  var leafFileHash = getLeafFileHash(txn);
  if (rootHash && leafFileHash) {
    var leaves = await getLeafData(leafFileHash);
    if (leaves) {
      for (let leafHash in leaves) {
        processLeaf(leaves[leafHash], leafHash, rootHash);
      }
    }
  }
}

function processLeaf(entity, leafHash, rootHash) {
  if (!entity || !Array.isArray(entity) || !entity.length) {
    throw new Error('Protocol Violation: entity is malformed');
  }
  if (entity.length === 1) {
    return await processGenesisOp(entity, leafHash, rootHash);
  }
  else {
    return await processUpdate(entity, leafHash, rootHash);
  }
}

async function processGenesisOp(entity, leafHash, rootHash){
  var id = rootHash + '-' + leafHash;
  var state = await getEntityState(id);
  if (state === null) {
    var genesis = entity[0];
    if (!validateOpSig(genesis)) {
      throw new Error('Protocol Violation: operation signature is invalid');
    }
    return await setEntityState(id, {
      id: id,
      src: entity,
      doc: mergeDiff({}, genesis.delta),      
      recovery: genesis.recovery || []
    });
  }
}

async function processUpdate(entity, leafHash, rootHash){
  if (!validateOpProof(update)) return false;
  var id = update[1].proof.id;
  var state = await getEntityState(id);
  var forkIndex;
  var forked = state.src.some((op, i) => {
    if (op.proof.leafHash !== generateOpHash(update[i])) {
      forkIndex = i;
      return true;
    }
  });
  if (forked){
    if (await validateFork(state, update)) {
      return await updateState(state, update, forkIndex);
    }
  }
  else if (update.length > state.src.length) {
    return await updateState(state, update, update.length);
  }
  else throw new Error('Protocol Violation: update discarded, duplicate detected');
}
```



# Blockchain REST API
The blockchain REST API interface aims to abstract the underlying blockchain away from the main protocol logic. This allows the underlying blockchain to be replaced without affecting the core protocol logic. The interface also allows the protocol logic to be implemented in an entirely different language while interfacing with the same blockchain.

All hashes used in the API are Base64URL encoded SHA256 hash.

>TODO: Decide on signature format.
>TODO: Decide on compression.


## Response HTTP status codes

| HTTP status code | Description                              |
| ---------------- | ---------------------------------------- |
| 200              | Everything went well.                    |
| 401              | Unauthenticated or unauthorized request. |
| 400              | Bad client request.                      |
| 500              | Server error.                            |


## Fetch Sidetree anchor file hashes
Fetches Sidetree anchor file hashes in chronological order.

>Note: The call may not to return all the known hashes in one batch, in which case the caller can use the last hash given in the returned batch of hashes to fetch subsequent hashes.

|                     |      |
| ------------------- | ---- |
| Minimum API version | v1.0 |

### Request path
```
GET /<api-version>/
```

### Request headers
| Name                  | Value                  |
| --------------------- | ---------------------- |
| ```Content-Type```    | ```application/json``` |

### Request body schema
```json
{
  "afterHash": "Optional. A valid Sidetree anchor file hash. When not given, all Sidetree anchor file hashes since
                inception will be returned. When given, only anchor file hashes after the given hash will be
                returned."
}
```

### Request example
```
GET /v1.0/
```
```json
{
  "afterHash": "exKwW0HjS5y4zBtJ7vYDwglYhtckdO15JDt1j5F5Q0A"
}
```

### Response body schema
```json
{
  "hasMoreHashes": "True if there are more hashes beyond the returned batch of hashes. False otherwise.",
  "anchorFileHashes": [
    {
      "confirmationTime": "The timestamp in ISO 8601 format 'YYYY-MM-DDThh:mm:ssZ' indicating when this hash was
        anchored to the blockchain.",
      "hash": "N-JQZifsEIzwZDVVrFnLRXKREIVTFhSFMC1pt08WFzI"
    }
  ]
}
```

### Response body example
```json
{
  "hasMoreHashes": false,  
  "anchorFileHashes": [
    {
      "confirmationTime": "2018-09-13T19:20:30Z",
      "hash": "b-7y19k4vQeYAqJXqphGcTlNoq-aQSGm8JPlE_hLmzA"
    },
    {
      "confirmationTime": "2018-09-13T20:00:00Z",
      "hash": "N-JQZifsEIzwZDVVrFnLRXKREIVTFhSFMC1pt08WFzI"
    }
  ]
}
```


## Write a Sidetree anchor file hash
Writes a Sidetree anchor file hash to the underlying blockchain.

|                     |      |
| ------------------- | ---- |
| Minimum API version | v1.0 |

### Request path
```
POST /<api-version>/
```

### Request headers
| Name                  | Value                  |
| --------------------- | ---------------------- |
| ```Content-Type```    | ```application/json``` |

### Request body schema
```json
{
  "anchorFileHash": "A Sidetree file hash."
}
```

### Request example
```
POST /v1.0/
```
```json
{
  "anchorFileHash": "exKwW0HjS5y4zBtJ7vYDwglYhtckdO15JDt1j5F5Q0A"
}
```

### Response body schema
None.


## Get block confirmation time
Gets the block confirmation time in UTC of the block identified by the given block hash.

|                     |      |
| ------------------- | ---- |
| Minimum API version | v1.0 |

### Request path
```
GET /<api-version>/confirmation-time/<block-hash>
```

### Request headers
None.

### Request body schema
None.

### Request example
```
Get /v1.0/confirmation-time/9vdoaofs7Cau0tYbOeSmF_8WY7O1i2Wf-alw-yFJRN8
```

### Response body schema
```json
{
  "confirmationTime": "The timestamp in ISO 8601 format 'YYYY-MM-DDThh:mm:ssZ' indicating when the block was
                       confirmed on blockchain."
}
```

### Response body example
```json
{
  "confirmationTime": "2018-09-13T19:20:30Z",
}
```


## Get last block hash
Gets the hash of the last confirmed block.

> TODO: Discuss and consider returning a list of block hash instead.

|                     |      |
| ------------------- | ---- |
| Minimum API version | v1.0 |

### Request path
```
GET /<api-version>/block-hash/last
```

### Request headers
None.

### Request body schema
None.

### Request example
```
Get /v1.0/block-hash/last
```

### Response body schema
```json
{
  "blockHash": "The hash of the last confirmed block."
}
```



# CAS REST API Interface
The CAS (content addressable storage) REST API interface aims to abstract the underlying Sidetree storage away from the main protocol logic. This allows the CAS to be updated or even replaced if needed without affecting the core protocol logic. Conversely, the interface also allows the protocol logic to be implemented in an entirely different language while interfacing with the same CAS.

## Response HTTP status codes

| HTTP status code | Description                              |
| ---------------- | ---------------------------------------- |
| 200              | Everything went well.                    |
| 401              | Unauthenticated or unauthorized request. |
| 400              | Bad client request.                      |
| 500              | Server error.                            |


## Read content
Read the content of a given address and return it in the response body as octet-stream.

|                     |      |
| ------------------- | ---- |
| Minimum API version | v1.0 |

### Request path
```
GET /<api-version>/<base64url-sha256-hash>
```

### Request example
```
GET /v1.0/b-7y19k4vQeYAqJXqphGcTlNoq-aQSGm8JPlE_hLmzA
```
### Response headers
| Name                  | Value                  |
| --------------------- | ---------------------- |
| ```Content-Type```    | ```application/octet-stream``` |


## Write content
Write content to CAS.

|                     |      |
| ------------------- | ---- |
| Minimum API version | v1.0 |

### Request path
```
POST /<api-version>/
```

### Request headers
| Name                  | Value                  |
| --------------------- | ---------------------- |
| ```Content-Type```    | ```application/octet-stream``` |

### Response headers
| Name                  | Value                  |
| --------------------- | ---------------------- |
| ```Content-Type```    | ```application/json``` |

### Response body schema
```json
{
  "hash": "Base64URL encoded SHA256 Hash of data written to CAS"
}
```

### Response body example
```json
{
  "hash": "b-7y19k4vQeYAqJXqphGcTlNoq-aQSGm8JPlE_hLmzA"
}
```