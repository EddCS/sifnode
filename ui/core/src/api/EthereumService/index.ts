import { reactive } from "@vue/reactivity";
import Web3 from "web3";
import { provider, WebsocketProvider } from "web3-core";
import { IWalletService } from "../IWalletService";
import { TxHash, TxParams, Asset, AssetAmount, Token } from "../../entities";
import {
  getEtheriumBalance,
  getTokenBalance,
  isEventEmittingProvider,
  transferAsset,
} from "./utils/ethereumUtils";
import { isToken } from "../../entities/utils/isToken";

type Address = string;
type Balances = AssetAmount[];

export type EthereumServiceContext = {
  getWeb3Provider: () => Promise<provider>;
  loadAssets: () => Promise<Asset[]>;
};

type MetaMaskProvider = WebsocketProvider & {
  request?: (a: any) => Promise<void>;
  isConnected(): boolean;
};

function isMetaMaskProvider(provider?: provider): provider is MetaMaskProvider {
  return typeof (provider as any).request === "function";
}

const initState = {
  connected: false,
  accounts: [],
  balances: [],
  address: "",
  log: "unset",
};

export class EthereumService implements IWalletService {
  private web3: Web3 | null = null;
  private supportedTokens: Asset[] = [];
  private blockSubscription: any;
  private provider: provider | undefined;

  // This is shared reactive state
  private state: {
    connected: boolean;
    address: Address;
    accounts: Address[];
    balances: AssetAmount[];
    log: string;
  };

  constructor(
    getWeb3Provider: () => Promise<provider>,
    private loadAssets: () => Promise<Asset[]>
  ) {
    // init state
    this.state = reactive({ ...initState });

    getWeb3Provider().then((provider) => {
      if (isEventEmittingProvider(provider)) {
        provider.on("connect", () => {
          this.state.connected = true;
        });
        provider.on("disconnect", () => {
          this.state.connected = false;
        });
      }
      this.provider = provider;
    });
  }

  getState() {
    return this.state;
  }

  private async updateData() {
    if (!this.web3) {
      this.state.connected = false;
      this.state.accounts = [];
      this.state.address = "";
      this.state.balances = [];
      return;
    }
    this.state.connected = !!this.web3;
    this.state.accounts = (await this.web3.eth.getAccounts()) ?? [];
    [this.state.address] = this.state.accounts;
    this.state.balances = await this.getBalance();
  }

  getAddress(): Address {
    return this.state.address;
  }

  isConnected() {
    return this.state.connected;
  }

  async connect() {
    try {
      this.supportedTokens = await this.loadAssets();

      if (!this.provider)
        throw new Error("Cannot connect because provider is not yet loaded!");

      this.web3 = new Web3(this.provider);

      // Let's test for Metamask
      if (isMetaMaskProvider(this.provider)) {
        if (this.provider.request) {
          // If metamask lets try and connect
          await this.provider.request({ method: "eth_requestAccounts" });
        }
      }

      this.addWeb3Subscription();
      await this.updateData();
    } catch (err) {
      this.web3 = null;
    }
  }

  addWeb3Subscription() {
    this.blockSubscription = this.web3?.eth.subscribe(
      "newBlockHeaders",
      (error, result) => {
        this.state.log = result?.hash ?? "null";
      }
    );
  }

  removeWeb3Subscription() {
    this.blockSubscription?.unsubscribe();
  }

  async disconnect() {
    if (isMetaMaskProvider(this.provider)) {
      if (this.provider.request) {
        await this.provider.request({
          method: "wallet_requestPermissions",
          params: [
            {
              eth_accounts: {},
            },
          ],
        });
      }
    }
    this.removeWeb3Subscription();
    this.web3 = null;
    await this.updateData();
  }

  async getBalance(
    address?: Address,
    asset?: Asset | Token
  ): Promise<Balances> {
    const supportedTokens = this.supportedTokens;
    const addr = address || this.state.address;

    if (!this.web3 || !addr) return [];

    const web3 = this.web3;

    let balances = [];

    if (asset) {
      if (!isToken(asset)) {
        // Asset must be eth
        const ethBalance = await getEtheriumBalance(web3, addr);
        balances = [ethBalance];
      } else {
        // Asset must be ERC-20
        const tokenBalance = await getTokenBalance(web3, addr, asset);
        balances = [tokenBalance];
      }
    }

    // No address no asset get everything
    balances = await Promise.all([
      getEtheriumBalance(web3, addr),
      ...supportedTokens.slice(0, 10).map((token: Asset) => {
        if (isToken(token)) return getTokenBalance(web3, addr, token);
        return AssetAmount(token, "0");
      }),
    ]);

    return balances;
  }

  async transfer(params: TxParams): Promise<TxHash> {
    // TODO: validate params!!
    if (!this.web3) {
      throw new Error(
        "Cannot do transfer because there is not yet a connection to Ethereum."
      );
    }

    const { amount, recipient, asset } = params;
    const from = this.getAddress();

    if (!from) {
      throw new Error(
        "Transaction attempted but 'from' address cannot be determined!"
      );
    }

    return await transferAsset(this.web3, from, recipient, amount, asset);
  }

  async signAndBroadcast() {}

  async setPhrase() {
    // We currently delegate auth to metamask so this is irrelavent
    return "";
  }

  purgeClient() {
    // We currently delegate auth to metamask so this is irrelavent
  }

  static create({
    getWeb3Provider,
    loadAssets,
  }: EthereumServiceContext): IWalletService {
    return new EthereumService(getWeb3Provider, loadAssets);
  }
}

export default EthereumService.create;
