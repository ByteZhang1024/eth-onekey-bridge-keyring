import { UI_REQUEST, UI_RESPONSE } from '@onekeyfe/hd-core';
import type {
  ConnectSettings,
  CoreApi,
  EVMGetPublicKeyParams,
  EVMSignedTx,
  EVMSignMessageParams,
  EVMSignTransactionParams,
  EVMSignTypedDataParams,
  Params,
  UiEvent,
  Unsuccessful,
} from '@onekeyfe/hd-core';
import { HardwareErrorCode } from '@onekeyfe/hd-shared';
import type { EthereumMessageSignature } from '@onekeyfe/hd-transport';

import { ONEKEY_HARDWARE_UI_EVENT } from './constants';
import { OneKeyBridge } from './onekey-bridge';

export type OneKeyIframeBridgeOptions = {
  bridgeUrl: string;
};

export class OneKeyWebBridge implements OneKeyBridge {
  isSDKInitialized = false;

  sdk: CoreApi | undefined = undefined;

  eventListeners: Map<string, (event: any) => void> = new Map();

  constructor() {
    console.log('OneKeyWebBridge constructor');
  }

  model?: string | undefined;

  on(_event: string, callback: (event: any) => void): void {
    this.eventListeners.set(_event, callback);
  }

  off(_event: string): void {
    this.eventListeners.delete(_event);
  }

  handleBlockErrorEvent(payload: Unsuccessful) {
    const { code } = payload.payload;
    const errorCodes: number[] = [
      HardwareErrorCode.WebDeviceNotFoundOrNeedsPermission,
      HardwareErrorCode.BridgeNotInstalled,
      HardwareErrorCode.NewFirmwareForceUpdate,
      HardwareErrorCode.NotAllowInBootloaderMode,
      HardwareErrorCode.CallMethodNeedUpgradeFirmware,
    ];

    if (code && typeof code === 'number' && errorCodes.includes(code)) {
      this.eventListeners.get(ONEKEY_HARDWARE_UI_EVENT)?.(payload.payload);
    }
  }

  async updateTransportMethod(
    transportType: ConnectSettings['env'],
  ): Promise<void> {
    if (!this.sdk) {
      return;
    }
    await this.sdk.switchTransport(transportType);
  }

  async init() {
    if (this.isSDKInitialized) {
      return;
    }
    const sdkLib = await import('@onekeyfe/hd-web-sdk');
    const { HardwareWebSdk, HardwareSDKLowLevel } = sdkLib.default;
    const settings: Partial<ConnectSettings> = {
      debug: true,
      fetchConfig: false,
      connectSrc: 'https://jssdk.onekey.so/1.0.26-alpha.3/',
      env: 'webusb',
    };
    try {
      await HardwareWebSdk.init(settings, HardwareSDKLowLevel);
      this.isSDKInitialized = true;
      this.sdk = HardwareWebSdk as unknown as CoreApi;

      // eslint-disable-next-line id-length
      this.sdk?.on('UI_EVENT', (e: any) => {
        const originEvent = e as UiEvent;
        console.log('===>>>> onekey event UI_EVENT: ', originEvent);
        if (originEvent.type === UI_REQUEST.REQUEST_PIN) {
          this.sdk?.uiResponse({
            type: UI_RESPONSE.RECEIVE_PIN,
            payload: '@@ONEKEY_INPUT_PIN_IN_DEVICE',
          });
        }
        if (originEvent.type === UI_REQUEST.REQUEST_PASSPHRASE) {
          this.sdk?.uiResponse({
            type: UI_RESPONSE.RECEIVE_PASSPHRASE,
            payload: {
              value: '',
              passphraseOnDevice: true,
              save: false,
            },
          });
        }
      });
    } catch (error) {
      this.isSDKInitialized = false;
    }
  }

  async destroy() {
    this.isSDKInitialized = false;
    this.sdk = undefined;
  }

  async dispose(): Promise<void> {
    this.sdk?.dispose();
    return Promise.resolve();
  }

  getModel(): string | undefined {
    return this.model;
  }

  async getPublicKey(params: {
    path: string;
    coin: string;
  }): Promise<
    | { success: false; payload: { error: string; code?: string | number } }
    | { success: true; payload: { publicKey: string; chainCode: string } }
  > {
    if (!this.sdk) {
      return {
        success: false,
        payload: { error: 'SDK not initialized', code: 800 },
      };
    }
    return await this.sdk.evmGetPublicKey('', '', params).then((result) => {
      if (result?.success) {
        return {
          success: true,
          payload: {
            publicKey: result.payload.pub,
            chainCode: result.payload.node.chain_code,
          },
        };
      }
      this.handleBlockErrorEvent(result);
      return {
        success: false,
        payload: {
          error: result?.payload.error ?? '',
          code:
            typeof result?.payload?.code === 'number'
              ? result?.payload?.code
              : undefined,
        },
      };
    });
  }

  async batchGetPublicKey(
    params: Params<any> & { bundle: EVMGetPublicKeyParams[] },
  ): Promise<
    | { success: false; payload: { error: string; code?: string | number } }
    | { success: true; payload: { pub: string }[] }
  > {
    if (!this.sdk) {
      return {
        success: false,
        payload: { error: 'SDK not initialized', code: 800 },
      };
    }
    return await this.sdk.evmGetPublicKey('', '', params).then((result) => {
      if (result?.success) {
        if (Array.isArray(result.payload)) {
          return {
            success: true,
            payload: result.payload.map((item) => ({ pub: item.pub })),
          };
        }
        return {
          success: false,
          payload: { error: 'No public key found', code: 800 },
        };
      }
      this.handleBlockErrorEvent(result);
      return {
        success: false,
        payload: {
          error: result?.payload.error ?? '',
          code: result?.payload.code ?? undefined,
        },
      };
    });
  }

  async getPassphraseState(): Promise<
    | { success: false; payload: { error: string; code?: string | number } }
    | { success: true; payload: string | undefined }
  > {
    if (!this.sdk) {
      return {
        success: false,
        payload: { error: 'SDK not initialized', code: 800 },
      };
    }
    return await this.sdk.getPassphraseState('').then((result) => {
      if (!result?.success) {
        this.handleBlockErrorEvent(result);
      }
      return result;
    });
  }

  async ethereumSignTransaction(
    params: Params<EVMSignTransactionParams>,
  ): Promise<
    | { success: false; payload: { error: string; code?: string | number } }
    | { success: true; payload: EVMSignedTx }
  > {
    if (!this.sdk) {
      return {
        success: false,
        payload: { error: 'SDK not initialized', code: 800 },
      };
    }
    return await this.sdk.evmSignTransaction('', '', params).then((result) => {
      if (!result?.success) {
        this.handleBlockErrorEvent(result);
      }
      return result;
    });
  }

  async ethereumSignMessage(
    params: Params<EVMSignMessageParams>,
  ): Promise<
    | { success: false; payload: { error: string; code?: string | number } }
    | { success: true; payload: EthereumMessageSignature }
  > {
    if (!this.sdk) {
      return {
        success: false,
        payload: { error: 'SDK not initialized', code: 800 },
      };
    }
    return await this.sdk.evmSignMessage('', '', params).then((result) => {
      if (!result?.success) {
        this.handleBlockErrorEvent(result);
      }
      return result;
    });
  }

  async ethereumSignTypedData(
    params: Params<EVMSignTypedDataParams>,
  ): Promise<
    | { success: false; payload: { error: string; code?: string | number } }
    | { success: true; payload: EthereumMessageSignature }
  > {
    if (!this.sdk) {
      return {
        success: false,
        payload: { error: 'SDK not initialized', code: 800 },
      };
    }
    return await this.sdk.evmSignTypedData('', '', params).then((result) => {
      if (!result?.success) {
        this.handleBlockErrorEvent(result);
      }
      return result;
    });
  }
}
