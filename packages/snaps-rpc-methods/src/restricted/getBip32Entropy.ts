import type { CryptographicFunctions } from '@metamask/key-tree';
import type {
  PermissionSpecificationBuilder,
  PermissionValidatorConstraint,
  RestrictedMethodOptions,
  ValidPermissionSpecification,
} from '@metamask/permission-controller';
import { PermissionType, SubjectType } from '@metamask/permission-controller';
import { rpcErrors } from '@metamask/rpc-errors';
import type {
  GetBip32EntropyParams,
  GetBip32EntropyResult,
} from '@metamask/snaps-sdk';
import { SnapCaveatType } from '@metamask/snaps-utils';
import type { NonEmptyArray } from '@metamask/utils';
import { assert } from '@metamask/utils';

import type { MethodHooksObject } from '../utils';
import {
  getNodeFromMnemonic,
  getNodeFromSeed,
  getValueFromEntropySource,
} from '../utils';

const targetName = 'snap_getBip32Entropy';

export type GetBip32EntropyMethodHooks = {
  /**
   * Get the mnemonic of the provided source. If no source is provided, the
   * mnemonic of the primary keyring will be returned.
   *
   * @param source - The optional ID of the source to get the mnemonic of.
   * @returns The mnemonic of the provided source, or the default source if no
   * source is provided.
   */
  getMnemonic: (source?: string | undefined) => Promise<Uint8Array>;

  /**
   * Get the mnemonic seed of the provided source. If no source is provided, the
   * mnemonic seed of the primary keyring will be returned.
   *
   * @param source - The optional ID of the source to get the mnemonic of.
   * @returns The mnemonic seed of the provided source, or the default source if no
   * source is provided.
   */
  getMnemonicSeed: (source?: string | undefined) => Promise<Uint8Array>;

  /**
   * Waits for the extension to be unlocked.
   *
   * @returns A promise that resolves once the extension is unlocked.
   */
  getUnlockPromise: (shouldShowUnlockRequest: boolean) => Promise<void>;

  /**
   * Get the cryptographic functions to use for the client. This may return an
   * empty object or `undefined` to fall back to the default cryptographic
   * functions.
   *
   * @returns The cryptographic functions to use for the client.
   */
  getClientCryptography: () => CryptographicFunctions | undefined;
};

type GetBip32EntropySpecificationBuilderOptions = {
  methodHooks: GetBip32EntropyMethodHooks;
};

type GetBip32EntropySpecification = ValidPermissionSpecification<{
  permissionType: PermissionType.RestrictedMethod;
  targetName: typeof targetName;
  methodImplementation: ReturnType<typeof getBip32EntropyImplementation>;
  allowedCaveats: Readonly<NonEmptyArray<string>> | null;
  validator: PermissionValidatorConstraint;
}>;

/**
 * The specification builder for the `snap_getBip32Entropy` permission.
 * `snap_getBip32Entropy` lets the Snap control private keys for a particular
 * BIP-32 node.
 *
 * @param options - The specification builder options.
 * @param options.methodHooks - The RPC method hooks needed by the method implementation.
 * @returns The specification for the `snap_getBip32Entropy` permission.
 */
const specificationBuilder: PermissionSpecificationBuilder<
  PermissionType.RestrictedMethod,
  GetBip32EntropySpecificationBuilderOptions,
  GetBip32EntropySpecification
> = ({ methodHooks }: GetBip32EntropySpecificationBuilderOptions) => {
  return {
    permissionType: PermissionType.RestrictedMethod,
    targetName,
    allowedCaveats: [SnapCaveatType.PermittedDerivationPaths],
    methodImplementation: getBip32EntropyImplementation(methodHooks),
    validator: ({ caveats }) => {
      if (
        caveats?.length !== 1 ||
        caveats[0].type !== SnapCaveatType.PermittedDerivationPaths
      ) {
        throw rpcErrors.invalidParams({
          message: `Expected a single "${SnapCaveatType.PermittedDerivationPaths}" caveat.`,
        });
      }
    },
    subjectTypes: [SubjectType.Snap],
  };
};

const methodHooks: MethodHooksObject<GetBip32EntropyMethodHooks> = {
  getMnemonic: true,
  getMnemonicSeed: true,
  getUnlockPromise: true,
  getClientCryptography: true,
};

export const getBip32EntropyBuilder = Object.freeze({
  targetName,
  specificationBuilder,
  methodHooks,
} as const);

/**
 * Builds the method implementation for `snap_getBip32Entropy`.
 *
 * @param hooks - The RPC method hooks.
 * @param hooks.getMnemonic - A function to retrieve the Secret Recovery Phrase of the user.
 * @param hooks.getMnemonicSeed - A function to retrieve the BIP-39 seed of the user.
 * @param hooks.getUnlockPromise - A function that resolves once the MetaMask extension is unlocked
 * and prompts the user to unlock their MetaMask if it is locked.
 * @param hooks.getClientCryptography - A function to retrieve the cryptographic
 * functions to use for the client.
 * @returns The method implementation which returns a `JsonSLIP10Node`.
 * @throws If the params are invalid.
 */
export function getBip32EntropyImplementation({
  getMnemonic,
  getMnemonicSeed,
  getUnlockPromise,
  getClientCryptography,
}: GetBip32EntropyMethodHooks) {
  return async function getBip32Entropy(
    args: RestrictedMethodOptions<GetBip32EntropyParams>,
  ): Promise<GetBip32EntropyResult> {
    await getUnlockPromise(true);

    const { params } = args;
    assert(params);

    // Using the seed is much faster, but we can only do it for these specific curves.
    if (params.curve === 'secp256k1' || params.curve === 'ed25519') {
      const seed = await getValueFromEntropySource(
        getMnemonicSeed,
        params.source,
      );

      const node = await getNodeFromSeed({
        curve: params.curve,
        path: params.path,
        seed,
        cryptographicFunctions: getClientCryptography(),
      });

      return node.toJSON();
    }

    const secretRecoveryPhrase = await getValueFromEntropySource(
      getMnemonic,
      params.source,
    );

    const node = await getNodeFromMnemonic({
      curve: params.curve,
      path: params.path,
      secretRecoveryPhrase,
      cryptographicFunctions: getClientCryptography(),
    });

    return node.toJSON();
  };
}
