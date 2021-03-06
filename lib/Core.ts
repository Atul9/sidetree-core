import BatchWriter from './BatchWriter';
import DownloadManager from './DownloadManager';
import ProtocolParameters, { IProtocolParameters } from './ProtocolParameters';
import MongoDbOperationStore from './MongoDbOperationStore';
import MongoDbTransactionStore from './MongoDbTransactionStore';
import Observer from './Observer';
import OperationProcessor from './OperationProcessor';
import RequestHandler from './RequestHandler';
import { BlockchainClient } from './Blockchain';
import { CasClient } from './Cas';
import { IConfig } from './Config';

/**
 * The core class that is instantiated when running a Sidetree node.
 */
export default class Core {
  private transactionStore: MongoDbTransactionStore;
  private operationStore: MongoDbOperationStore;
  private observer: Observer;

  /**
   * Operation and resolve request handler.
   */
  public requestHandler: RequestHandler;

  /**
   * Core constructor.
   */
  public constructor (config: IConfig, versionsOfProtocolParameters: IProtocolParameters[]) {
    ProtocolParameters.initialize(versionsOfProtocolParameters);

    // Component dependency initialization & injection.
    const blockchain = new BlockchainClient(config.blockchainServiceUri);
    const cas = new CasClient(config.contentAddressableStoreServiceUri);
    const downloadManager = new DownloadManager(config.maxConcurrentDownloads, cas);
    const batchWriter = new BatchWriter(blockchain, cas, config.batchingIntervalInSeconds);
    this.operationStore = new MongoDbOperationStore(config.mongoDbConnectionString);
    const operationProcessor = new OperationProcessor(config.didMethodName, this.operationStore);
    this.transactionStore = new MongoDbTransactionStore(config.mongoDbConnectionString);
    this.observer = new Observer(blockchain, downloadManager, operationProcessor, this.transactionStore, config.observingIntervalInSeconds);
    this.requestHandler = new RequestHandler(operationProcessor, blockchain, batchWriter, config.didMethodName);

    downloadManager.start();
    batchWriter.startPeriodicBatchWriting();
  }

  /**
   * The initialization method that must be called before consumption of this core object.
   * The method starts the Observer and Batch Writer.
   */
  public async initialize () {
    await this.transactionStore.initialize();
    await this.operationStore.initialize();
    await this.observer.startPeriodicProcessing();
  }
}
