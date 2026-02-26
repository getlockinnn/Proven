/**
 * On-chain account structures for the challenge program
 * These match the Anchor program's account layouts
 */

import { PublicKey } from '@solana/web3.js';

/**
 * Participant account structure
 * Mirrors the Rust struct from the Solana program
 */
export interface ParticipantAccount {
  challenge: PublicKey;
  user: PublicKey;
  stakeAmount: bigint;
  proofCount: number;
  joinedAt: bigint;
  lastProofAt: bigint;
  hasWithdrawn: boolean;
}

/**
 * Challenge account structure
 * Mirrors the Rust struct from the Solana program
 */
export interface ChallengeAccount {
  creator: PublicKey;
  escrow: PublicKey;
  oracle: PublicKey;
  stakeAmount: bigint;
  startTime: bigint;
  endTime: bigint;
  participantCount: number;
  totalStaked: bigint;
  isActive: boolean;
}

/**
 * Borsh schema for deserializing participant accounts
 */
class ParticipantAccountBorsh {
  challenge: Uint8Array;
  user: Uint8Array;
  stakeAmount: bigint;
  proofCount: number;
  joinedAt: bigint;
  lastProofAt: bigint;
  hasWithdrawn: number; // u8 in Rust

  constructor(fields: {
    challenge: Uint8Array;
    user: Uint8Array;
    stakeAmount: bigint;
    proofCount: number;
    joinedAt: bigint;
    lastProofAt: bigint;
    hasWithdrawn: number;
  }) {
    this.challenge = fields.challenge;
    this.user = fields.user;
    this.stakeAmount = fields.stakeAmount;
    this.proofCount = fields.proofCount;
    this.joinedAt = fields.joinedAt;
    this.lastProofAt = fields.lastProofAt;
    this.hasWithdrawn = fields.hasWithdrawn;
  }

  static schema = new Map([
    [
      ParticipantAccountBorsh,
      {
        kind: 'struct' as const,
        fields: [
          ['challenge', [32]], // 32-byte pubkey
          ['user', [32]], // 32-byte pubkey
          ['stakeAmount', 'u64'],
          ['proofCount', 'u32'],
          ['joinedAt', 'i64'],
          ['lastProofAt', 'i64'],
          ['hasWithdrawn', 'u8'],
        ],
      },
    ],
  ]);
}

/**
 * Deserialize a participant account from raw bytes
 * Using manual parsing instead of borsh for better control
 */
export function deserializeParticipantAccount(data: Buffer): ParticipantAccount {
  // Skip the 8-byte discriminator that Anchor adds
  let offset = 8;

  // Read challenge pubkey (32 bytes)
  const challenge = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;

  // Read user pubkey (32 bytes)
  const user = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;

  // Read stake amount (u64, 8 bytes, little-endian)
  const stakeAmount = data.readBigUInt64LE(offset);
  offset += 8;

  // Read proof count (u32, 4 bytes, little-endian)
  const proofCount = data.readUInt32LE(offset);
  offset += 4;

  // Read joined_at (i64, 8 bytes, little-endian)
  const joinedAt = data.readBigInt64LE(offset);
  offset += 8;

  // Read last_proof_at (i64, 8 bytes, little-endian)
  const lastProofAt = data.readBigInt64LE(offset);
  offset += 8;

  // Read has_withdrawn (u8, 1 byte)
  const hasWithdrawn = data.readUInt8(offset) === 1;

  return {
    challenge,
    user,
    stakeAmount,
    proofCount,
    joinedAt,
    lastProofAt,
    hasWithdrawn,
  };
}

/**
 * Borsh schema for deserializing challenge accounts
 */
class ChallengeAccountBorsh {
  creator: Uint8Array;
  escrow: Uint8Array;
  oracle: Uint8Array;
  stakeAmount: bigint;
  startTime: bigint;
  endTime: bigint;
  participantCount: number;
  totalStaked: bigint;
  isActive: number;

  constructor(fields: {
    creator: Uint8Array;
    escrow: Uint8Array;
    oracle: Uint8Array;
    stakeAmount: bigint;
    startTime: bigint;
    endTime: bigint;
    participantCount: number;
    totalStaked: bigint;
    isActive: number;
  }) {
    this.creator = fields.creator;
    this.escrow = fields.escrow;
    this.oracle = fields.oracle;
    this.stakeAmount = fields.stakeAmount;
    this.startTime = fields.startTime;
    this.endTime = fields.endTime;
    this.participantCount = fields.participantCount;
    this.totalStaked = fields.totalStaked;
    this.isActive = fields.isActive;
  }

  static schema = new Map([
    [
      ChallengeAccountBorsh,
      {
        kind: 'struct' as const,
        fields: [
          ['creator', [32]],
          ['escrow', [32]],
          ['oracle', [32]],
          ['stakeAmount', 'u64'],
          ['startTime', 'i64'],
          ['endTime', 'i64'],
          ['participantCount', 'u32'],
          ['totalStaked', 'u64'],
          ['isActive', 'u8'],
        ],
      },
    ],
  ]);
}

/**
 * Deserialize a challenge account from raw bytes
 * Using manual parsing instead of borsh for better control
 */
export function deserializeChallengeAccount(data: Buffer): ChallengeAccount {
  // Skip the 8-byte discriminator that Anchor adds
  let offset = 8;

  // Read creator pubkey (32 bytes)
  const creator = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;

  // Read escrow pubkey (32 bytes)
  const escrow = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;

  // Read oracle pubkey (32 bytes)
  const oracle = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;

  // Read stake amount (u64, 8 bytes, little-endian)
  const stakeAmount = data.readBigUInt64LE(offset);
  offset += 8;

  // Read start_time (i64, 8 bytes, little-endian)
  const startTime = data.readBigInt64LE(offset);
  offset += 8;

  // Read end_time (i64, 8 bytes, little-endian)
  const endTime = data.readBigInt64LE(offset);
  offset += 8;

  // Read participant_count (u32, 4 bytes, little-endian)
  const participantCount = data.readUInt32LE(offset);
  offset += 4;

  // Read total_staked (u64, 8 bytes, little-endian)
  const totalStaked = data.readBigUInt64LE(offset);
  offset += 8;

  // Read is_active (u8, 1 byte)
  const isActive = data.readUInt8(offset) === 1;

  return {
    creator,
    escrow,
    oracle,
    stakeAmount,
    startTime,
    endTime,
    participantCount,
    totalStaked,
    isActive,
  };
}
