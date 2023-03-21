import { replaceEqualDeep } from 'vue-query'
import { unref, computed } from 'vue-demi'
import { deepEqual, parseContractResult, readContract } from '@wagmi/core'
import { useChainId, useQuery, useInvalidateOnBlock } from '../../utils'
import { useBlockNumber } from '../network-status'

import type { Abi } from 'abitype'
import type { UnwrapRef } from 'vue-demi'
import type { ReadContractConfig as ReadContractConfig_, ReadContractResult } from '@wagmi/core'
import type { MaybeRef, DeepMaybeRef, PartialBy, QueryConfig, QueryFunctionArgs } from '../../types'

type ReadContractConfig<
  TAbi extends Abi | readonly unknown[] = Abi,
  TFunctionName extends string = string,
> = DeepMaybeRef<ReadContractConfig_<TAbi, TFunctionName>>

export type UseContractReadConfig<
  TAbi extends Abi | readonly unknown[] = Abi,
  TFunctionName extends string = string,
  TSelectData = ReadContractResult<TAbi, TFunctionName>,
> = PartialBy<
  ReadContractConfig,
  'abi' | 'address' | 'args' | 'functionName'
> &
  QueryConfig<ReadContractResult<TAbi, TFunctionName>, Error, TSelectData> & {
    /** If set to `true`, the cache will depend on the block number */
    cacheOnBlock?: MaybeRef<boolean>
    /** Subscribe to changes */
    watch?: MaybeRef<boolean>
  }

type QueryKeyArgs = DeepMaybeRef<Omit<ReadContractConfig, 'abi'>>
type QueryKeyConfig = Pick<UseContractReadConfig, 'scopeKey'> & {
  blockNumber?: MaybeRef<number>
}

function queryKey ({
  address,
  args,
  blockNumber,
  chainId,
  functionName,
  overrides,
  scopeKey,
}: QueryKeyArgs & QueryKeyConfig) {
  return [
    {
      entity: 'readContract',
      address,
      args,
      blockNumber,
      chainId,
      functionName,
      overrides,
      scopeKey,
    },
  ] as const
}

function queryFn<
  TAbi extends Abi | readonly unknown[],
  TFunctionName extends string
> ({ abi }: { abi?: Abi | readonly unknown[] }) {
  return async ({
    queryKey: [{ address, args, chainId, functionName, overrides }]
  }: UnwrapRef<QueryFunctionArgs<typeof queryKey>>) => {
    if (!abi) throw new Error('abi is required')
    if (!address) throw new Error('address is required')
    return ((await readContract({
      address,
      args,
      chainId,
      // TODO: Remove cast and still support `Narrow<TAbi>`
      abi: abi as Abi,
      functionName,
      // @ts-ignore
      overrides
    })) ?? null) as ReadContractResult<TAbi, TFunctionName>
  }
}

export function useContractRead<
  TAbi extends Abi | readonly unknown[] = Abi,
  TFunctionName extends string = string,
  TSelectData = ReadContractResult<TAbi, TFunctionName>
> ({
  abi,
  address,
  args,
  cacheOnBlock = false,
  cacheTime,
  chainId: chainId_,
  enabled: enabled_ = true,
  functionName,
  isDataEqual,
  onError,
  onSettled,
  onSuccess,
  overrides,
  scopeKey,
  select,
  staleTime,
  structuralSharing = (oldData, newData) =>
    deepEqual(oldData, newData)
      ? oldData
      : (replaceEqualDeep(oldData, newData) as any),
  suspense,
  watch
}: UseContractReadConfig<TAbi, TFunctionName, TSelectData> = {} as any) {
  const chainId = useChainId({ chainId: chainId_ })
  const { data: blockNumber } = useBlockNumber({
    chainId,
    enabled: computed(() => unref(watch) || unref(cacheOnBlock)),
    scopeKey: computed(() => unref(watch) || unref(cacheOnBlock) ? undefined : 'idle') as MaybeRef<string>,
    watch
  })

  const queryKey_ = computed(() => queryKey({
    address,
    args,
    blockNumber: unref(cacheOnBlock) ? blockNumber : undefined,
    chainId,
    functionName,
    overrides,
    scopeKey
  } as QueryKeyArgs)) as any

  const enabled = computed(() => {
    let enabled = Boolean(unref(enabled_) && unref(abi) && unref(address) && unref(functionName))
    if (unref(cacheOnBlock)) enabled = Boolean(unref(enabled) && unref(blockNumber))
    return enabled
  })

  useInvalidateOnBlock({
    chainId,
    enabled: computed(() => unref(enabled) && unref(watch) && !unref(cacheOnBlock)),
    queryKey: queryKey_
  })

  return useQuery(
    queryKey_,
    queryFn({
      // TODO: Remove cast and still support `Narrow<TAbi>`
      abi: unref(abi) as Abi,
    }),
    {
      cacheTime,
      enabled,
      isDataEqual,
      select(data) {
        const result =
          abi && functionName
            ? parseContractResult({
                // TODO: Remove cast and still support `Narrow<TAbi>`
                abi: unref(abi) as Abi,
                data,
                functionName: unref(functionName)
              })
            : data
        return select ? select(result) : result
      },
      staleTime,
      structuralSharing,
      suspense,
      onError,
      onSettled,
      onSuccess,
    },
  )
}