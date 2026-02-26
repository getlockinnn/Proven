#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("8UMUh8uz4QAd5K5j4vSB5fGXTfCngJc4Gf1YJuydT9qw");

/// Win threshold: 80% of days (8000 basis points)
pub const WIN_THRESHOLD_BPS: u16 = 8000;

/// Default "day length" in seconds used to compute `end_ts`.
/// Stored on the factory so tests/localnet can shorten it without changing code.
pub const DEFAULT_DAY_LENGTH_SECONDS: i64 = 24 * 60 * 60;

fn required_days(total_days: u32, threshold_bps: u16) -> u32 {
    // Ceil(total_days * threshold_bps / 10000).
    // This avoids the bug where `total_days=1` and `threshold_bps=8000` would floor to 0.
    let numerator = (total_days as u64)
        .saturating_mul(threshold_bps as u64)
        .saturating_add(9999);
    (numerator / 10000) as u32
}

#[program]
pub mod proven_stake {
    use super::*;

    // ============================================================
    // FACTORY INSTRUCTIONS
    // ============================================================

    /// Initialize the Escrow Factory (one-time setup)
    /// This creates the root factory account that will create all challenge escrows
    pub fn initialize_factory(ctx: Context<InitializeFactory>) -> Result<()> {
        let factory = &mut ctx.accounts.factory;
        factory.authority = ctx.accounts.authority.key();
        factory.treasury = ctx.accounts.treasury.key();
        factory.oracle = ctx.accounts.oracle.key();
        factory.challenge_count = 0;
        factory.day_length_seconds = DEFAULT_DAY_LENGTH_SECONDS;
        factory.bump = ctx.bumps.factory;

        emit!(FactoryInitialized {
            authority: factory.authority,
            treasury: factory.treasury,
            oracle: factory.oracle,
        });

        Ok(())
    }

    /// Update factory settings (authority only)
    pub fn update_factory(
        ctx: Context<UpdateFactory>,
        new_authority: Option<Pubkey>,
        new_treasury: Option<Pubkey>,
        new_oracle: Option<Pubkey>,
        new_day_length_seconds: Option<i64>,
    ) -> Result<()> {
        let factory = &mut ctx.accounts.factory;

        if let Some(authority) = new_authority {
            factory.authority = authority;
        }
        if let Some(treasury) = new_treasury {
            factory.treasury = treasury;
        }
        if let Some(oracle) = new_oracle {
            factory.oracle = oracle;
        }
        if let Some(day_length_seconds) = new_day_length_seconds {
            require!(day_length_seconds > 0, ProvenError::InvalidDayLength);
            factory.day_length_seconds = day_length_seconds;
        }

        emit!(FactoryUpdated {
            authority: factory.authority,
            treasury: factory.treasury,
            oracle: factory.oracle,
        });

        Ok(())
    }

    // ============================================================
    // CHALLENGE ESCROW INSTRUCTIONS
    // ============================================================

    /// Create a new challenge escrow via the factory
    /// Each challenge has its own isolated escrow account
    pub fn create_challenge(
        ctx: Context<CreateChallenge>,
        challenge_id: String,
        stake_amount: u64,
        total_days: u32,
        start_ts: i64,
    ) -> Result<()> {
        // Validations
        require!(stake_amount > 0, ProvenError::InvalidAmount);
        require!(total_days > 0, ProvenError::InvalidDuration);
        require!(
            start_ts > Clock::get()?.unix_timestamp,
            ProvenError::InvalidStartTime
        );
        require!(!challenge_id.is_empty(), ProvenError::ChallengeIdEmpty);
        require!(
            challenge_id.as_bytes().len() <= ChallengeEscrow::MAX_ID_LENGTH,
            ProvenError::ChallengeIdTooLong
        );

        let factory = &mut ctx.accounts.factory;
        let challenge = &mut ctx.accounts.challenge;

        require!(
            factory.day_length_seconds > 0,
            ProvenError::InvalidDayLength
        );

        // Initialize challenge escrow
        challenge.challenge_id = challenge_id.clone();
        challenge.factory = factory.key();
        challenge.creator = ctx.accounts.creator.key();
        challenge.token_mint = ctx.accounts.token_mint.key();
        challenge.escrow_vault = ctx.accounts.escrow_vault.key();
        challenge.stake_amount = stake_amount;
        challenge.total_days = total_days;
        challenge.threshold_bps = WIN_THRESHOLD_BPS; // Fixed 80%
        challenge.status = ChallengeStatus::Created;
        challenge.start_ts = start_ts;
        challenge.end_ts = start_ts + (total_days as i64 * factory.day_length_seconds);
        challenge.participant_count = 0;
        challenge.active_participants = 0;
        challenge.winner_count = 0;
        challenge.loser_count = 0;
        challenge.bonus_per_winner = 0;
        challenge.forfeited_amount = 0;
        challenge.remainder = 0;
        challenge.payouts_claimed_count = 0;
        challenge.remainder_claimed = 0;
        challenge.bump = ctx.bumps.challenge;

        // Increment factory challenge count
        factory.challenge_count = factory
            .challenge_count
            .checked_add(1)
            .ok_or(ProvenError::MathOverflow)?;

        emit!(ChallengeCreated {
            challenge_id: challenge.key(),
            factory: factory.key(),
            creator: challenge.creator,
            stake_amount,
            total_days,
            start_ts,
            threshold_bps: WIN_THRESHOLD_BPS,
        });

        Ok(())
    }

    /// User joins a challenge by staking USDC
    /// Must join BEFORE the challenge starts (no late joins)
    pub fn join_challenge(ctx: Context<JoinChallenge>, challenge_id: String) -> Result<()> {
        let challenge = &mut ctx.accounts.challenge;
        let participant = &mut ctx.accounts.participant;
        let clock = Clock::get()?;

        require!(
            challenge.challenge_id == challenge_id,
            ProvenError::ChallengeIdMismatch
        );
        require!(
            challenge.status == ChallengeStatus::Created,
            ProvenError::InvalidChallengeStatus
        );
        // No late joins - must join before start
        require!(
            clock.unix_timestamp < challenge.start_ts,
            ProvenError::ChallengeStarted
        );

        // Transfer USDC from user to escrow vault
        let cpi_accounts = Transfer {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx.accounts.escrow_vault.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, challenge.stake_amount)?;

        // Initialize participant account
        participant.user = ctx.accounts.user.key();
        participant.challenge = challenge.key();
        participant.joined = true;
        participant.stake_deposited = challenge.stake_amount;
        participant.proof_days = 0;
        participant.is_winner = false;
        participant.is_settled = false;
        participant.payout_claimed = false;
        participant.refund_claimed = false;
        participant.bump = ctx.bumps.participant;

        // Update challenge stats
        challenge.participant_count += 1;
        challenge.active_participants = challenge
            .active_participants
            .checked_add(1)
            .ok_or(ProvenError::MathOverflow)?;

        emit!(ChallengeJoined {
            challenge_id: challenge.key(),
            user: ctx.accounts.user.key(),
            stake_amount: challenge.stake_amount,
            participant_count: challenge.participant_count,
        });

        Ok(())
    }

    /// Oracle records a proof submission for a participant
    /// Called after off-chain verification approves the daily proof
    pub fn record_proof(ctx: Context<RecordProof>, challenge_id: String) -> Result<()> {
        let factory = &ctx.accounts.factory;
        let challenge = &mut ctx.accounts.challenge;
        let participant = &mut ctx.accounts.participant;
        let clock = Clock::get()?;

        require!(
            challenge.challenge_id == challenge_id,
            ProvenError::ChallengeIdMismatch
        );
        require!(
            challenge.status == ChallengeStatus::Created
                || challenge.status == ChallengeStatus::Started,
            ProvenError::InvalidChallengeStatus
        );
        require!(
            clock.unix_timestamp >= challenge.start_ts,
            ProvenError::ChallengeNotStarted
        );
        require!(
            clock.unix_timestamp <= challenge.end_ts,
            ProvenError::ChallengeEnded
        );
        require!(participant.joined, ProvenError::NotJoined);
        // Verify oracle authority
        require!(
            ctx.accounts.oracle.key() == factory.oracle,
            ProvenError::InvalidOracle
        );
        // Prevent recording more proofs than total days
        require!(
            participant.proof_days < challenge.total_days,
            ProvenError::MaxProofsReached
        );

        // Auto-start challenge on first proof
        if challenge.status == ChallengeStatus::Created {
            challenge.status = ChallengeStatus::Started;
        }

        // Increment proof days for participant
        participant.proof_days += 1;

        emit!(ProofRecorded {
            challenge_id: challenge.key(),
            user: participant.user,
            proof_days: participant.proof_days,
            total_required: required_days(challenge.total_days, challenge.threshold_bps),
        });

        Ok(())
    }

    /// Oracle marks the challenge as ended (after end_ts)
    pub fn settle_challenge(ctx: Context<SettleChallenge>, challenge_id: String) -> Result<()> {
        let factory = &ctx.accounts.factory;
        let challenge = &mut ctx.accounts.challenge;
        let clock = Clock::get()?;

        require!(
            challenge.challenge_id == challenge_id,
            ProvenError::ChallengeIdMismatch
        );
        require!(
            challenge.status == ChallengeStatus::Created
                || challenge.status == ChallengeStatus::Started,
            ProvenError::InvalidChallengeStatus
        );
        require!(
            clock.unix_timestamp > challenge.end_ts,
            ProvenError::ChallengeNotEnded
        );
        require!(
            ctx.accounts.oracle.key() == factory.oracle,
            ProvenError::InvalidOracle
        );

        challenge.status = ChallengeStatus::Ended;

        let required_days = required_days(challenge.total_days, challenge.threshold_bps);

        emit!(ChallengeSettlementStarted {
            challenge_id: challenge.key(),
            required_days,
            participant_count: challenge.participant_count,
        });

        Ok(())
    }

    /// Oracle settles each participant (determines winner/loser)
    pub fn settle_participant(ctx: Context<SettleParticipant>, challenge_id: String) -> Result<()> {
        let factory = &ctx.accounts.factory;
        let challenge = &mut ctx.accounts.challenge;
        let participant = &mut ctx.accounts.participant;

        require!(
            challenge.challenge_id == challenge_id,
            ProvenError::ChallengeIdMismatch
        );
        require!(
            challenge.status == ChallengeStatus::Ended,
            ProvenError::InvalidChallengeStatus
        );
        require!(
            ctx.accounts.oracle.key() == factory.oracle,
            ProvenError::InvalidOracle
        );
        require!(!participant.is_settled, ProvenError::AlreadySettled);

        // Calculate required days (80% threshold)
        let required_days = required_days(challenge.total_days, challenge.threshold_bps);

        if participant.proof_days >= required_days {
            // Winner!
            participant.is_winner = true;
            challenge.winner_count += 1;
        } else {
            // Loser - their stake goes to the pool
            challenge.loser_count += 1;
        }

        participant.is_settled = true;

        emit!(ParticipantSettled {
            challenge_id: challenge.key(),
            user: participant.user,
            is_winner: participant.is_winner,
            proof_days: participant.proof_days,
            required_days,
        });

        Ok(())
    }

    /// Oracle finalizes settlement and calculates payouts
    /// Handles three scenarios:
    /// 1. No winners → All stakes go to platform treasury
    /// 2. Everyone wins → Return stakes only (no bonus)
    /// 3. Mixed → Winners split losers' stakes
    pub fn finalize_settlement(
        ctx: Context<FinalizeSettlement>,
        challenge_id: String,
    ) -> Result<()> {
        let factory = &ctx.accounts.factory;
        let challenge = &mut ctx.accounts.challenge;

        require!(
            challenge.challenge_id == challenge_id,
            ProvenError::ChallengeIdMismatch
        );
        require!(
            challenge.status == ChallengeStatus::Ended,
            ProvenError::InvalidChallengeStatus
        );
        require!(
            ctx.accounts.oracle.key() == factory.oracle,
            ProvenError::InvalidOracle
        );
        // Ensure all participants are settled
        require!(
            challenge.winner_count + challenge.loser_count == challenge.participant_count,
            ProvenError::SettlementIncomplete
        );

        // Calculate losers' total stakes
        let losers_stakes = challenge.loser_count as u64 * challenge.stake_amount;

        challenge.payouts_claimed_count = 0;
        challenge.remainder_claimed = 0;

        if challenge.winner_count == 0 {
            // SCENARIO 1: No winners - all stakes go to platform treasury
            let total_stakes = challenge.participant_count as u64 * challenge.stake_amount;
            challenge.forfeited_amount = total_stakes;
            challenge.bonus_per_winner = 0;
            challenge.remainder = 0;

            emit!(NoWinnersForfeiture {
                challenge_id: challenge.key(),
                forfeited_amount: total_stakes,
                loser_count: challenge.loser_count,
            });
        } else if challenge.loser_count == 0 {
            // SCENARIO 2: Everyone wins - just return stakes, no bonus
            challenge.bonus_per_winner = 0;
            challenge.remainder = 0;
            challenge.forfeited_amount = 0;
        } else {
            // SCENARIO 3: Mixed - winners split losers' stakes
            challenge.bonus_per_winner = losers_stakes / challenge.winner_count as u64;
            challenge.remainder = losers_stakes % challenge.winner_count as u64;
            challenge.forfeited_amount = 0;
        }

        challenge.status = ChallengeStatus::Settled;

        emit!(ChallengeSettled {
            challenge_id: challenge.key(),
            winner_count: challenge.winner_count,
            loser_count: challenge.loser_count,
            bonus_per_winner: challenge.bonus_per_winner,
            forfeited_amount: challenge.forfeited_amount,
        });

        Ok(())
    }

    /// Winner claims their payout (original stake + bonus from losers)
    pub fn claim_payout(ctx: Context<ClaimPayout>, challenge_id: String) -> Result<()> {
        let challenge = &ctx.accounts.challenge;
        let participant = &ctx.accounts.participant;

        require!(
            challenge.challenge_id == challenge_id,
            ProvenError::ChallengeIdMismatch
        );
        require!(
            challenge.status == ChallengeStatus::Settled,
            ProvenError::ChallengeNotSettled
        );
        require!(participant.is_settled, ProvenError::NotSettled);
        require!(participant.is_winner, ProvenError::NotWinner);
        require!(
            !participant.payout_claimed,
            ProvenError::PayoutAlreadyClaimed
        );
        require!(
            challenge.payouts_claimed_count < challenge.winner_count,
            ProvenError::AllPayoutsClaimed
        );

        // Calculate total payout (original stake + bonus)
        let mut bonus = challenge.bonus_per_winner;
        let mut remainder_increment: u64 = 0;

        // Distribute remainder (dust) to early claimers
        if challenge.remainder_claimed < challenge.remainder {
            bonus = bonus.checked_add(1).ok_or(ProvenError::MathOverflow)?;
            remainder_increment = 1;
        }

        let payout_amount = challenge
            .stake_amount
            .checked_add(bonus)
            .ok_or(ProvenError::MathOverflow)?;

        // Store values for PDA signer and event
        let challenge_id_str = challenge.challenge_id.clone();
        let factory_key = challenge.factory;
        let bump = challenge.bump;
        let stake_amount = challenge.stake_amount;
        let user_pubkey = participant.user;

        let seeds = &[
            b"challenge",
            challenge_id_str.as_bytes(),
            factory_key.as_ref(),
            &[bump],
        ];
        let signer = &[&seeds[..]];

        // Transfer tokens from escrow to winner
        let cpi_accounts = Transfer {
            from: ctx.accounts.escrow_vault.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: ctx.accounts.challenge.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::transfer(cpi_ctx, payout_amount)?;

        // Update state
        let challenge = &mut ctx.accounts.challenge;
        let participant = &mut ctx.accounts.participant;

        participant.payout_claimed = true;
        challenge.payouts_claimed_count = challenge
            .payouts_claimed_count
            .checked_add(1)
            .ok_or(ProvenError::MathOverflow)?;
        challenge.remainder_claimed = challenge
            .remainder_claimed
            .checked_add(remainder_increment)
            .ok_or(ProvenError::MathOverflow)?;

        emit!(PayoutClaimed {
            challenge_id: challenge.key(),
            user: user_pubkey,
            stake_returned: stake_amount,
            bonus_received: bonus,
            total_amount: payout_amount,
        });

        Ok(())
    }

    /// Platform treasury claims forfeited stakes (when no winners)
    pub fn claim_forfeited_stakes(
        ctx: Context<ClaimForfeitedStakes>,
        challenge_id: String,
    ) -> Result<()> {
        let factory = &ctx.accounts.factory;
        let challenge = &ctx.accounts.challenge;

        require!(
            challenge.challenge_id == challenge_id,
            ProvenError::ChallengeIdMismatch
        );
        require!(
            challenge.status == ChallengeStatus::Settled,
            ProvenError::ChallengeNotSettled
        );
        require!(challenge.winner_count == 0, ProvenError::HasWinners);
        require!(
            challenge.forfeited_amount > 0,
            ProvenError::NoForfeitedStakes
        );
        // Only treasury can claim
        require!(
            ctx.accounts.treasury.key() == factory.treasury,
            ProvenError::Unauthorized
        );

        let forfeited = challenge.forfeited_amount;
        let treasury_pubkey = factory.treasury;

        // Prepare PDA signer
        let challenge_id_str = challenge.challenge_id.clone();
        let factory_key = challenge.factory;
        let bump = challenge.bump;

        let seeds = &[
            b"challenge",
            challenge_id_str.as_bytes(),
            factory_key.as_ref(),
            &[bump],
        ];
        let signer = &[&seeds[..]];

        // Transfer forfeited stakes to treasury
        let cpi_accounts = Transfer {
            from: ctx.accounts.escrow_vault.to_account_info(),
            to: ctx.accounts.treasury_token_account.to_account_info(),
            authority: ctx.accounts.challenge.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::transfer(cpi_ctx, forfeited)?;

        // Update state after transfer
        let challenge = &mut ctx.accounts.challenge;
        challenge.forfeited_amount = 0;

        emit!(ForfeitedStakesClaimed {
            challenge_id: challenge.key(),
            treasury: treasury_pubkey,
            amount: forfeited,
        });

        Ok(())
    }

    /// Creator cancels a challenge BEFORE it starts
    pub fn cancel_challenge(ctx: Context<CancelChallenge>, challenge_id: String) -> Result<()> {
        let challenge = &mut ctx.accounts.challenge;
        let clock = Clock::get()?;

        require!(
            challenge.challenge_id == challenge_id,
            ProvenError::ChallengeIdMismatch
        );
        require!(
            challenge.creator == ctx.accounts.creator.key(),
            ProvenError::Unauthorized
        );
        require!(
            challenge.status == ChallengeStatus::Created,
            ProvenError::InvalidChallengeStatus
        );
        // Can only cancel before start
        require!(
            clock.unix_timestamp < challenge.start_ts,
            ProvenError::ChallengeStarted
        );

        challenge.status = ChallengeStatus::Cancelled;

        emit!(ChallengeCancelled {
            challenge_id: challenge.key(),
            creator: challenge.creator,
            participant_count: challenge.participant_count,
        });

        Ok(())
    }

    /// Participant claims refund after challenge is cancelled
    pub fn claim_refund(ctx: Context<ClaimRefund>, challenge_id: String) -> Result<()> {
        let challenge = &ctx.accounts.challenge;
        let participant = &mut ctx.accounts.participant;

        require!(
            challenge.challenge_id == challenge_id,
            ProvenError::ChallengeIdMismatch
        );
        require!(
            challenge.status == ChallengeStatus::Cancelled,
            ProvenError::NotCancelled
        );
        require!(participant.joined, ProvenError::NotJoined);
        require!(!participant.refund_claimed, ProvenError::AlreadyClaimed);

        // Prepare PDA signer
        let challenge_id_str = challenge.challenge_id.clone();
        let factory = challenge.factory;
        let bump = challenge.bump;

        let seeds = &[
            b"challenge",
            challenge_id_str.as_bytes(),
            factory.as_ref(),
            &[bump],
        ];
        let signer = &[&seeds[..]];

        // Transfer stake back to user
        let cpi_accounts = Transfer {
            from: ctx.accounts.escrow_vault.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: ctx.accounts.challenge.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::transfer(cpi_ctx, participant.stake_deposited)?;

        participant.refund_claimed = true;

        emit!(RefundClaimed {
            challenge_id: ctx.accounts.challenge.key(),
            user: participant.user,
            amount: participant.stake_deposited,
        });

        Ok(())
    }

    /// Close participant account to reclaim rent
    pub fn close_participant(ctx: Context<CloseParticipant>, challenge_id: String) -> Result<()> {
        let authority = &ctx.accounts.authority;
        let challenge = &mut ctx.accounts.challenge;
        let participant = &ctx.accounts.participant;
        let destination = &ctx.accounts.destination;

        require!(
            challenge.challenge_id == challenge_id,
            ProvenError::ChallengeIdMismatch
        );
        require!(
            participant.user == destination.key(),
            ProvenError::Unauthorized
        );
        require!(
            authority.key() == participant.user || authority.key() == challenge.creator,
            ProvenError::Unauthorized
        );

        match challenge.status {
            ChallengeStatus::Settled => {
                require!(participant.is_settled, ProvenError::NotSettled);
                if participant.is_winner {
                    require!(participant.payout_claimed, ProvenError::PayoutNotClaimed);
                }
            }
            ChallengeStatus::Cancelled => {
                require!(participant.refund_claimed, ProvenError::RefundNotClaimed);
            }
            _ => return err!(ProvenError::ChallengeStillActive),
        }

        challenge.active_participants = challenge
            .active_participants
            .checked_sub(1)
            .ok_or(ProvenError::MathOverflow)?;

        emit!(ParticipantClosed {
            challenge_id: challenge.key(),
            user: participant.user,
            closed_by: authority.key(),
        });

        Ok(())
    }

    /// Close the escrow vault to reclaim rent (after all payouts/forfeitures claimed)
    pub fn close_escrow_vault(
        ctx: Context<CloseEscrowVault>,
        challenge_id: String,
    ) -> Result<()> {
        let challenge = &ctx.accounts.challenge;

        require!(
            challenge.challenge_id == challenge_id,
            ProvenError::ChallengeIdMismatch
        );
        require!(
            challenge.creator == ctx.accounts.creator.key(),
            ProvenError::Unauthorized
        );

        // Ensure all funds have been distributed
        match challenge.status {
            ChallengeStatus::Settled => {
                if challenge.winner_count > 0 {
                    require!(
                        challenge.payouts_claimed_count == challenge.winner_count,
                        ProvenError::PendingWinnerPayouts
                    );
                }
                if challenge.winner_count == 0 {
                    require!(
                        challenge.forfeited_amount == 0,
                        ProvenError::ForfeitedStakesUnclaimed
                    );
                }
            }
            ChallengeStatus::Cancelled => {
                // For cancelled challenges, ensure all refunds are processed
                // This is checked via active_participants in close_challenge
            }
            _ => return err!(ProvenError::ChallengeStillActive),
        }

        // Verify escrow vault is empty
        require!(
            ctx.accounts.escrow_vault.amount == 0,
            ProvenError::EscrowNotEmpty
        );

        // Close the escrow vault - transfer remaining lamports to creator
        let challenge_id_str = challenge.challenge_id.clone();
        let factory_key = challenge.factory;
        let bump = challenge.bump;

        let seeds = &[
            b"challenge",
            challenge_id_str.as_bytes(),
            factory_key.as_ref(),
            &[bump],
        ];
        let signer = &[&seeds[..]];

        let cpi_accounts = token::CloseAccount {
            account: ctx.accounts.escrow_vault.to_account_info(),
            destination: ctx.accounts.creator.to_account_info(),
            authority: ctx.accounts.challenge.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::close_account(cpi_ctx)?;

        emit!(EscrowVaultClosed {
            challenge_id: challenge.key(),
            creator: challenge.creator,
        });

        Ok(())
    }

    /// Close challenge account to reclaim rent (after all payouts complete)
    pub fn close_challenge(ctx: Context<CloseChallenge>, challenge_id: String) -> Result<()> {
        let creator = &ctx.accounts.creator;
        let challenge = &ctx.accounts.challenge;

        require!(
            challenge.challenge_id == challenge_id,
            ProvenError::ChallengeIdMismatch
        );
        require!(challenge.creator == creator.key(), ProvenError::Unauthorized);

        match challenge.status {
            ChallengeStatus::Settled => {
                // If there were winners, all must have claimed
                if challenge.winner_count > 0 {
                    require!(
                        challenge.payouts_claimed_count == challenge.winner_count,
                        ProvenError::PendingWinnerPayouts
                    );
                    require!(
                        challenge.remainder_claimed == challenge.remainder,
                        ProvenError::PendingRemainderDistribution
                    );
                }
                // If no winners, forfeited stakes must be claimed by treasury
                if challenge.winner_count == 0 {
                    require!(
                        challenge.forfeited_amount == 0,
                        ProvenError::ForfeitedStakesUnclaimed
                    );
                }
            }
            ChallengeStatus::Cancelled => {
                // All refunds must be claimed (active_participants == 0)
            }
            _ => return err!(ProvenError::ChallengeStillActive),
        }

        require!(
            challenge.active_participants == 0,
            ProvenError::ParticipantsRemaining
        );

        emit!(ChallengeClosed {
            challenge_id: challenge.key(),
            creator: challenge.creator,
        });

        Ok(())
    }
}

// ============================================================
// ACCOUNT CONTEXTS
// ============================================================

#[derive(Accounts)]
pub struct InitializeFactory<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: Treasury account to receive forfeited stakes
    pub treasury: UncheckedAccount<'info>,
    /// CHECK: Oracle pubkey for proof verification
    pub oracle: UncheckedAccount<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + EscrowFactory::LEN,
        seeds = [b"factory"],
        bump,
    )]
    pub factory: Account<'info, EscrowFactory>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateFactory<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"factory"],
        bump = factory.bump,
        has_one = authority @ ProvenError::Unauthorized,
    )]
    pub factory: Account<'info, EscrowFactory>,
}

#[derive(Accounts)]
#[instruction(challenge_id: String)]
pub struct CreateChallenge<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        mut,
        seeds = [b"factory"],
        bump = factory.bump,
    )]
    pub factory: Account<'info, EscrowFactory>,
    #[account(
        init,
        payer = creator,
        space = 8 + ChallengeEscrow::LEN,
        seeds = [b"challenge", challenge_id.as_bytes(), factory.key().as_ref()],
        bump,
    )]
    pub challenge: Account<'info, ChallengeEscrow>,
    pub token_mint: Account<'info, Mint>,
    #[account(
        init,
        payer = creator,
        associated_token::mint = token_mint,
        associated_token::authority = challenge,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[derive(Accounts)]
#[instruction(challenge_id: String)]
pub struct JoinChallenge<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        seeds = [b"factory"],
        bump = factory.bump,
    )]
    pub factory: Account<'info, EscrowFactory>,
    #[account(
        mut,
        seeds = [b"challenge", challenge_id.as_bytes(), factory.key().as_ref()],
        bump = challenge.bump,
    )]
    pub challenge: Account<'info, ChallengeEscrow>,
    #[account(
        init,
        payer = user,
        space = 8 + Participant::LEN,
        seeds = [b"participant", challenge.key().as_ref(), user.key().as_ref()],
        bump,
    )]
    pub participant: Account<'info, Participant>,
    #[account(
        mut,
        associated_token::mint = challenge.token_mint,
        associated_token::authority = user,
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = challenge.token_mint,
        associated_token::authority = challenge,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(challenge_id: String)]
pub struct RecordProof<'info> {
    pub oracle: Signer<'info>,
    #[account(
        seeds = [b"factory"],
        bump = factory.bump,
    )]
    pub factory: Account<'info, EscrowFactory>,
    #[account(
        mut,
        seeds = [b"challenge", challenge_id.as_bytes(), factory.key().as_ref()],
        bump = challenge.bump,
    )]
    pub challenge: Account<'info, ChallengeEscrow>,
    #[account(
        mut,
        seeds = [b"participant", challenge.key().as_ref(), participant.user.as_ref()],
        bump = participant.bump,
    )]
    pub participant: Account<'info, Participant>,
}

#[derive(Accounts)]
#[instruction(challenge_id: String)]
pub struct SettleChallenge<'info> {
    pub oracle: Signer<'info>,
    #[account(
        seeds = [b"factory"],
        bump = factory.bump,
    )]
    pub factory: Account<'info, EscrowFactory>,
    #[account(
        mut,
        seeds = [b"challenge", challenge_id.as_bytes(), factory.key().as_ref()],
        bump = challenge.bump,
    )]
    pub challenge: Account<'info, ChallengeEscrow>,
}

#[derive(Accounts)]
#[instruction(challenge_id: String)]
pub struct SettleParticipant<'info> {
    pub oracle: Signer<'info>,
    #[account(
        seeds = [b"factory"],
        bump = factory.bump,
    )]
    pub factory: Account<'info, EscrowFactory>,
    #[account(
        mut,
        seeds = [b"challenge", challenge_id.as_bytes(), factory.key().as_ref()],
        bump = challenge.bump,
    )]
    pub challenge: Account<'info, ChallengeEscrow>,
    #[account(
        mut,
        seeds = [b"participant", challenge.key().as_ref(), participant.user.as_ref()],
        bump = participant.bump,
    )]
    pub participant: Account<'info, Participant>,
}

#[derive(Accounts)]
#[instruction(challenge_id: String)]
pub struct FinalizeSettlement<'info> {
    pub oracle: Signer<'info>,
    #[account(
        seeds = [b"factory"],
        bump = factory.bump,
    )]
    pub factory: Account<'info, EscrowFactory>,
    #[account(
        mut,
        seeds = [b"challenge", challenge_id.as_bytes(), factory.key().as_ref()],
        bump = challenge.bump,
    )]
    pub challenge: Account<'info, ChallengeEscrow>,
}

#[derive(Accounts)]
#[instruction(challenge_id: String)]
pub struct ClaimPayout<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        seeds = [b"factory"],
        bump = factory.bump,
    )]
    pub factory: Account<'info, EscrowFactory>,
    #[account(
        mut,
        seeds = [b"challenge", challenge_id.as_bytes(), factory.key().as_ref()],
        bump = challenge.bump,
    )]
    pub challenge: Account<'info, ChallengeEscrow>,
    #[account(
        mut,
        seeds = [b"participant", challenge.key().as_ref(), user.key().as_ref()],
        bump = participant.bump,
    )]
    pub participant: Account<'info, Participant>,
    #[account(
        mut,
        associated_token::mint = challenge.token_mint,
        associated_token::authority = user,
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = challenge.token_mint,
        associated_token::authority = challenge,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(challenge_id: String)]
pub struct ClaimForfeitedStakes<'info> {
    #[account(mut)]
    pub treasury: Signer<'info>,
    #[account(
        seeds = [b"factory"],
        bump = factory.bump,
    )]
    pub factory: Account<'info, EscrowFactory>,
    #[account(
        mut,
        seeds = [b"challenge", challenge_id.as_bytes(), factory.key().as_ref()],
        bump = challenge.bump,
    )]
    pub challenge: Account<'info, ChallengeEscrow>,
    #[account(
        mut,
        associated_token::mint = challenge.token_mint,
        associated_token::authority = treasury,
    )]
    pub treasury_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = challenge.token_mint,
        associated_token::authority = challenge,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(challenge_id: String)]
pub struct CancelChallenge<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        seeds = [b"factory"],
        bump = factory.bump,
    )]
    pub factory: Account<'info, EscrowFactory>,
    #[account(
        mut,
        seeds = [b"challenge", challenge_id.as_bytes(), factory.key().as_ref()],
        bump = challenge.bump,
    )]
    pub challenge: Account<'info, ChallengeEscrow>,
}

#[derive(Accounts)]
#[instruction(challenge_id: String)]
pub struct ClaimRefund<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        seeds = [b"factory"],
        bump = factory.bump,
    )]
    pub factory: Account<'info, EscrowFactory>,
    #[account(
        seeds = [b"challenge", challenge_id.as_bytes(), factory.key().as_ref()],
        bump = challenge.bump,
    )]
    pub challenge: Account<'info, ChallengeEscrow>,
    #[account(
        mut,
        seeds = [b"participant", challenge.key().as_ref(), user.key().as_ref()],
        bump = participant.bump,
    )]
    pub participant: Account<'info, Participant>,
    #[account(
        mut,
        associated_token::mint = challenge.token_mint,
        associated_token::authority = user,
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = challenge.token_mint,
        associated_token::authority = challenge,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(challenge_id: String)]
pub struct CloseParticipant<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"factory"],
        bump = factory.bump,
    )]
    pub factory: Account<'info, EscrowFactory>,
    #[account(
        mut,
        seeds = [b"challenge", challenge_id.as_bytes(), factory.key().as_ref()],
        bump = challenge.bump,
    )]
    pub challenge: Account<'info, ChallengeEscrow>,
    #[account(
        mut,
        close = destination,
        seeds = [b"participant", challenge.key().as_ref(), participant.user.as_ref()],
        bump = participant.bump,
    )]
    pub participant: Account<'info, Participant>,
    /// CHECK: validated against participant.user in handler
    #[account(mut)]
    pub destination: UncheckedAccount<'info>,
}

#[derive(Accounts)]
#[instruction(challenge_id: String)]
pub struct CloseEscrowVault<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        seeds = [b"factory"],
        bump = factory.bump,
    )]
    pub factory: Account<'info, EscrowFactory>,
    #[account(
        seeds = [b"challenge", challenge_id.as_bytes(), factory.key().as_ref()],
        bump = challenge.bump,
    )]
    pub challenge: Account<'info, ChallengeEscrow>,
    #[account(
        mut,
        associated_token::mint = challenge.token_mint,
        associated_token::authority = challenge,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(challenge_id: String)]
pub struct CloseChallenge<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        seeds = [b"factory"],
        bump = factory.bump,
    )]
    pub factory: Account<'info, EscrowFactory>,
    #[account(
        mut,
        close = creator,
        seeds = [b"challenge", challenge_id.as_bytes(), factory.key().as_ref()],
        bump = challenge.bump,
    )]
    pub challenge: Account<'info, ChallengeEscrow>,
}

// ============================================================
// ACCOUNTS
// ============================================================

/// Escrow Factory - Root contract that creates challenge escrows
#[account]
pub struct EscrowFactory {
    /// Authority that can update factory settings
    pub authority: Pubkey,
    /// Treasury account to receive forfeited stakes (no winners scenario)
    pub treasury: Pubkey,
    /// Oracle pubkey for proof verification and settlement
    pub oracle: Pubkey,
    /// Total challenges created
    pub challenge_count: u64,
    /// Day length used to compute challenge end time (seconds)
    pub day_length_seconds: i64,
    /// PDA bump seed
    pub bump: u8,
}

impl EscrowFactory {
    pub const LEN: usize = 32 + 32 + 32 + 8 + 8 + 1; // 113 bytes
}

/// Challenge Escrow - Individual escrow for each challenge
#[account]
pub struct ChallengeEscrow {
    /// Unique challenge identifier
    pub challenge_id: String,
    /// Factory that created this escrow
    pub factory: Pubkey,
    /// Challenge creator
    pub creator: Pubkey,
    /// Token mint (USDC)
    pub token_mint: Pubkey,
    /// Escrow vault holding staked tokens
    pub escrow_vault: Pubkey,
    /// Required stake amount per participant
    pub stake_amount: u64,
    /// Challenge duration in days
    pub total_days: u32,
    /// Win threshold in basis points (8000 = 80%)
    pub threshold_bps: u16,
    /// Current challenge status
    pub status: ChallengeStatus,
    /// Challenge start timestamp
    pub start_ts: i64,
    /// Challenge end timestamp
    pub end_ts: i64,
    /// Total participants joined
    pub participant_count: u32,
    /// Active participants (not closed)
    pub active_participants: u32,
    /// Number of winners
    pub winner_count: u32,
    /// Number of losers
    pub loser_count: u32,
    /// Bonus per winner (losers' stakes / winners)
    pub bonus_per_winner: u64,
    /// Forfeited stakes (when no winners)
    pub forfeited_amount: u64,
    /// Remainder from integer division
    pub remainder: u64,
    /// Number of payouts claimed
    pub payouts_claimed_count: u32,
    /// Remainder tokens claimed
    pub remainder_claimed: u64,
    /// PDA bump seed
    pub bump: u8,
}

impl ChallengeEscrow {
    pub const MAX_ID_LENGTH: usize = 32;
    pub const LEN: usize = 4 // String discriminator
        + Self::MAX_ID_LENGTH // challenge_id
        + 32  // factory
        + 32  // creator
        + 32  // token_mint
        + 32  // escrow_vault
        + 8   // stake_amount
        + 4   // total_days
        + 2   // threshold_bps
        + 1   // status
        + 8   // start_ts
        + 8   // end_ts
        + 4   // participant_count
        + 4   // active_participants
        + 4   // winner_count
        + 4   // loser_count
        + 8   // bonus_per_winner
        + 8   // forfeited_amount
        + 8   // remainder
        + 4   // payouts_claimed_count
        + 8   // remainder_claimed
        + 1;  // bump
              // Total: 226 bytes
}

/// Participant in a challenge
#[account]
pub struct Participant {
    /// User's wallet address
    pub user: Pubkey,
    /// Challenge account
    pub challenge: Pubkey,
    /// Whether user has joined
    pub joined: bool,
    /// Amount staked
    pub stake_deposited: u64,
    /// Number of verified proof days
    pub proof_days: u32,
    /// Whether user won
    pub is_winner: bool,
    /// Whether settlement determined winner/loser
    pub is_settled: bool,
    /// Whether payout was claimed
    pub payout_claimed: bool,
    /// Whether refund was claimed (for cancellation)
    pub refund_claimed: bool,
    /// PDA bump seed
    pub bump: u8,
}

impl Participant {
    pub const LEN: usize = 32 + 32 + 1 + 8 + 4 + 1 + 1 + 1 + 1 + 1; // 82 bytes
}

/// Challenge status enum
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum ChallengeStatus {
    /// Challenge created, accepting participants
    Created,
    /// Challenge in progress
    Started,
    /// Challenge ended, awaiting settlement
    Ended,
    /// Settlement complete, payouts available
    Settled,
    /// Challenge cancelled, refunds available
    Cancelled,
}

// ============================================================
// EVENTS
// ============================================================

#[event]
pub struct FactoryInitialized {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub oracle: Pubkey,
}

#[event]
pub struct FactoryUpdated {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub oracle: Pubkey,
}

#[event]
pub struct ChallengeCreated {
    pub challenge_id: Pubkey,
    pub factory: Pubkey,
    pub creator: Pubkey,
    pub stake_amount: u64,
    pub total_days: u32,
    pub start_ts: i64,
    pub threshold_bps: u16,
}

#[event]
pub struct ChallengeJoined {
    pub challenge_id: Pubkey,
    pub user: Pubkey,
    pub stake_amount: u64,
    pub participant_count: u32,
}

#[event]
pub struct ProofRecorded {
    pub challenge_id: Pubkey,
    pub user: Pubkey,
    pub proof_days: u32,
    pub total_required: u32,
}

#[event]
pub struct ChallengeSettlementStarted {
    pub challenge_id: Pubkey,
    pub required_days: u32,
    pub participant_count: u32,
}

#[event]
pub struct ParticipantSettled {
    pub challenge_id: Pubkey,
    pub user: Pubkey,
    pub is_winner: bool,
    pub proof_days: u32,
    pub required_days: u32,
}

#[event]
pub struct NoWinnersForfeiture {
    pub challenge_id: Pubkey,
    pub forfeited_amount: u64,
    pub loser_count: u32,
}

#[event]
pub struct ChallengeSettled {
    pub challenge_id: Pubkey,
    pub winner_count: u32,
    pub loser_count: u32,
    pub bonus_per_winner: u64,
    pub forfeited_amount: u64,
}

#[event]
pub struct PayoutClaimed {
    pub challenge_id: Pubkey,
    pub user: Pubkey,
    pub stake_returned: u64,
    pub bonus_received: u64,
    pub total_amount: u64,
}

#[event]
pub struct ForfeitedStakesClaimed {
    pub challenge_id: Pubkey,
    pub treasury: Pubkey,
    pub amount: u64,
}

#[event]
pub struct ChallengeCancelled {
    pub challenge_id: Pubkey,
    pub creator: Pubkey,
    pub participant_count: u32,
}

#[event]
pub struct RefundClaimed {
    pub challenge_id: Pubkey,
    pub user: Pubkey,
    pub amount: u64,
}

#[event]
pub struct ParticipantClosed {
    pub challenge_id: Pubkey,
    pub user: Pubkey,
    pub closed_by: Pubkey,
}

#[event]
pub struct ChallengeClosed {
    pub challenge_id: Pubkey,
    pub creator: Pubkey,
}

#[event]
pub struct EscrowVaultClosed {
    pub challenge_id: Pubkey,
    pub creator: Pubkey,
}

// ============================================================
// ERRORS
// ============================================================

#[error_code]
pub enum ProvenError {
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Invalid duration")]
    InvalidDuration,
    #[msg("Invalid start time")]
    InvalidStartTime,
    #[msg("Invalid day length")]
    InvalidDayLength,
    #[msg("Challenge ID cannot be empty")]
    ChallengeIdEmpty,
    #[msg("Challenge ID too long")]
    ChallengeIdTooLong,
    #[msg("Challenge ID mismatch")]
    ChallengeIdMismatch,
    #[msg("Invalid challenge status")]
    InvalidChallengeStatus,
    #[msg("Challenge already started")]
    ChallengeStarted,
    #[msg("Challenge not started yet")]
    ChallengeNotStarted,
    #[msg("Challenge has ended")]
    ChallengeEnded,
    #[msg("User not joined")]
    NotJoined,
    #[msg("Invalid oracle")]
    InvalidOracle,
    #[msg("Challenge not ended yet")]
    ChallengeNotEnded,
    #[msg("Participant already settled")]
    AlreadySettled,
    #[msg("Settlement incomplete")]
    SettlementIncomplete,
    #[msg("Challenge not settled")]
    ChallengeNotSettled,
    #[msg("User is not a winner")]
    NotWinner,
    #[msg("Payout already claimed")]
    PayoutAlreadyClaimed,
    #[msg("Unauthorized action")]
    Unauthorized,
    #[msg("Challenge is not cancelled")]
    NotCancelled,
    #[msg("Already claimed refund")]
    AlreadyClaimed,
    #[msg("Participant not settled yet")]
    NotSettled,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Challenge still active")]
    ChallengeStillActive,
    #[msg("Winner payouts still pending")]
    PendingWinnerPayouts,
    #[msg("All winner payouts already claimed")]
    AllPayoutsClaimed,
    #[msg("Remainder distribution pending")]
    PendingRemainderDistribution,
    #[msg("Active participants remain")]
    ParticipantsRemaining,
    #[msg("Winner payout not claimed")]
    PayoutNotClaimed,
    #[msg("Refund not claimed")]
    RefundNotClaimed,
    #[msg("Challenge has winners")]
    HasWinners,
    #[msg("No forfeited stakes to claim")]
    NoForfeitedStakes,
    #[msg("Forfeited stakes not yet claimed by treasury")]
    ForfeitedStakesUnclaimed,
    #[msg("Maximum proofs already recorded for this participant")]
    MaxProofsReached,
    #[msg("Escrow vault still has tokens")]
    EscrowNotEmpty,
}
