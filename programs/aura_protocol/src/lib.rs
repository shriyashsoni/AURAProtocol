use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod aura_protocol {
    use super::*;

    pub fn initialize_protocol(ctx: Context<InitializeProtocol>, fee_basis_points: u16) -> Result<()> {
        require!(fee_basis_points <= 10_000, AuraError::InvalidFee);
        let protocol = &mut ctx.accounts.protocol;
        protocol.authority = ctx.accounts.authority.key();
        protocol.reward_authority = ctx.accounts.authority.key();
        protocol.fee_basis_points = fee_basis_points;
        protocol.paused = false;
        protocol.network_count = 0;
        protocol.profile_count = 0;
        protocol.total_campaign_points = 0;
        Ok(())
    }

    pub fn set_protocol_paused(ctx: Context<SetProtocolPaused>, paused: bool) -> Result<()> {
        ctx.accounts.protocol.paused = paused;
        Ok(())
    }

    pub fn register_operator(ctx: Context<RegisterOperator>) -> Result<()> {
        require!(!ctx.accounts.protocol.paused, AuraError::ProtocolPaused);
        let operator = &mut ctx.accounts.operator;
        operator.authority = ctx.accounts.authority.key();
        operator.network_count = 0;
        operator.status = OperatorStatus::Active;
        operator.created_at = Clock::get()?.unix_timestamp;
        Ok(())
    }

    pub fn register_network(ctx: Context<RegisterNetwork>, network_id: u64, metadata_hash: [u8; 32]) -> Result<()> {
        require!(!ctx.accounts.protocol.paused, AuraError::ProtocolPaused);
        let network = &mut ctx.accounts.network;
        network.operator = ctx.accounts.operator.key();
        network.network_id = network_id;
        network.metadata_hash = metadata_hash;
        network.state = NetworkState::Probation;
        network.created_at = Clock::get()?.unix_timestamp;
        network.updated_at = network.created_at;
        ctx.accounts.operator.network_count = checked_add(ctx.accounts.operator.network_count, 1)?;
        ctx.accounts.protocol.network_count = checked_add(ctx.accounts.protocol.network_count, 1)?;
        Ok(())
    }

    pub fn set_network_state(ctx: Context<SetNetworkState>, state: NetworkState) -> Result<()> {
        require!(!ctx.accounts.protocol.paused, AuraError::ProtocolPaused);
        ctx.accounts.network.state = state;
        ctx.accounts.network.updated_at = Clock::get()?.unix_timestamp;
        Ok(())
    }

    pub fn publish_reward_epoch(
        ctx: Context<PublishRewardEpoch>,
        epoch_number: u64,
        merkle_root: [u8; 32],
        total_reward_units: u64,
        verified_session_count: u64,
    ) -> Result<()> {
        require!(!ctx.accounts.protocol.paused, AuraError::ProtocolPaused);
        let epoch = &mut ctx.accounts.epoch;
        epoch.epoch_number = epoch_number;
        epoch.merkle_root = merkle_root;
        epoch.total_reward_units = total_reward_units;
        epoch.verified_session_count = verified_session_count;
        epoch.closed_at = Clock::get()?.unix_timestamp;
        epoch.state = EpochState::Published;
        Ok(())
    }

    pub fn record_network_reward_claim(ctx: Context<RecordNetworkRewardClaim>, amount_units: u64) -> Result<()> {
        require!(!ctx.accounts.protocol.paused, AuraError::ProtocolPaused);
        require!(ctx.accounts.epoch.state == EpochState::Published, AuraError::EpochNotPublished);
        require!(amount_units > 0, AuraError::InvalidClaimAmount);
        let receipt = &mut ctx.accounts.claim_receipt;
        receipt.epoch = ctx.accounts.epoch.key();
        receipt.network = ctx.accounts.network.key();
        receipt.claimer = ctx.accounts.claimer.key();
        receipt.amount_units = amount_units;
        receipt.claimed_at = Clock::get()?.unix_timestamp;
        Ok(())
    }

    pub fn initialize_campaign(ctx: Context<InitializeCampaign>, reward_mint: Pubkey) -> Result<()> {
        require!(!ctx.accounts.protocol.paused, AuraError::ProtocolPaused);
        let campaign = &mut ctx.accounts.campaign;
        campaign.authority = ctx.accounts.authority.key();
        campaign.reward_mint = reward_mint;
        campaign.total_profiles = 0;
        campaign.total_earned_points = 0;
        campaign.total_staked_points = 0;
        campaign.created_at = Clock::get()?.unix_timestamp;
        Ok(())
    }

    pub fn create_profile(ctx: Context<CreateProfile>, handle: String, wallet_ref_hash: [u8; 32]) -> Result<()> {
        require!(!ctx.accounts.protocol.paused, AuraError::ProtocolPaused);
        require!(handle.as_bytes().len() >= 2 && handle.as_bytes().len() <= 32, AuraError::InvalidHandle);
        let profile = &mut ctx.accounts.profile;
        profile.owner = ctx.accounts.owner.key();
        profile.handle = handle;
        profile.wallet_ref_hash = wallet_ref_hash;
        profile.twitter_hash = [0; 32];
        profile.earned_points = 120;
        profile.staked_points = 0;
        profile.claimed_points = 0;
        profile.quest_count = 1;
        profile.created_at = Clock::get()?.unix_timestamp;
        profile.updated_at = profile.created_at;
        ctx.accounts.protocol.profile_count = checked_add(ctx.accounts.protocol.profile_count, 1)?;
        ctx.accounts.protocol.total_campaign_points = checked_add(ctx.accounts.protocol.total_campaign_points, 120)?;
        ctx.accounts.campaign.total_profiles = checked_add(ctx.accounts.campaign.total_profiles, 1)?;
        ctx.accounts.campaign.total_earned_points = checked_add(ctx.accounts.campaign.total_earned_points, 120)?;
        Ok(())
    }

    pub fn update_profile_social(ctx: Context<UpdateProfileSocial>, twitter_hash: [u8; 32]) -> Result<()> {
        require!(!ctx.accounts.protocol.paused, AuraError::ProtocolPaused);
        ctx.accounts.profile.twitter_hash = twitter_hash;
        ctx.accounts.profile.updated_at = Clock::get()?.unix_timestamp;
        Ok(())
    }

    pub fn complete_quest(ctx: Context<CompleteQuest>, quest_hash: [u8; 32], reward_points: u64) -> Result<()> {
        require!(!ctx.accounts.protocol.paused, AuraError::ProtocolPaused);
        require!(reward_points > 0 && reward_points <= 100_000, AuraError::InvalidReward);
        let receipt = &mut ctx.accounts.quest_receipt;
        receipt.profile = ctx.accounts.profile.key();
        receipt.quest_hash = quest_hash;
        receipt.reward_points = reward_points;
        receipt.completed_at = Clock::get()?.unix_timestamp;
        ctx.accounts.profile.earned_points = checked_add(ctx.accounts.profile.earned_points, reward_points)?;
        ctx.accounts.profile.quest_count = checked_add(ctx.accounts.profile.quest_count, 1)?;
        ctx.accounts.profile.updated_at = receipt.completed_at;
        ctx.accounts.campaign.total_earned_points = checked_add(ctx.accounts.campaign.total_earned_points, reward_points)?;
        ctx.accounts.protocol.total_campaign_points = checked_add(ctx.accounts.protocol.total_campaign_points, reward_points)?;
        Ok(())
    }

    pub fn stake_points(ctx: Context<StakePoints>, stake_nonce: u64, amount_points: u64, lock_days: u16) -> Result<()> {
        require!(!ctx.accounts.protocol.paused, AuraError::ProtocolPaused);
        require!(amount_points > 0, AuraError::InvalidStakeAmount);
        require!(lock_days >= 7 && lock_days <= 365, AuraError::InvalidLock);
        let unlocked = ctx.accounts.profile.earned_points
            .checked_sub(ctx.accounts.profile.staked_points).ok_or(AuraError::Overflow)?
            .checked_sub(ctx.accounts.profile.claimed_points).ok_or(AuraError::Overflow)?;
        require!(amount_points <= unlocked, AuraError::InsufficientUnlockedPoints);
        let now = Clock::get()?.unix_timestamp;
        let position = &mut ctx.accounts.stake_position;
        position.profile = ctx.accounts.profile.key();
        position.owner = ctx.accounts.owner.key();
        position.stake_nonce = stake_nonce;
        position.amount_points = amount_points;
        position.locked_until = now + (lock_days as i64 * 86_400);
        position.created_at = now;
        ctx.accounts.profile.staked_points = checked_add(ctx.accounts.profile.staked_points, amount_points)?;
        ctx.accounts.profile.updated_at = now;
        ctx.accounts.campaign.total_staked_points = checked_add(ctx.accounts.campaign.total_staked_points, amount_points)?;
        Ok(())
    }

    pub fn claim_campaign_points(ctx: Context<ClaimCampaignPoints>, claim_nonce: u64, amount_points: u64) -> Result<()> {
        require!(!ctx.accounts.protocol.paused, AuraError::ProtocolPaused);
        require!(amount_points > 0, AuraError::InvalidClaimAmount);
        let claimable = ctx.accounts.profile.earned_points
            .checked_sub(ctx.accounts.profile.staked_points).ok_or(AuraError::Overflow)?
            .checked_sub(ctx.accounts.profile.claimed_points).ok_or(AuraError::Overflow)?;
        require!(amount_points <= claimable, AuraError::InsufficientUnlockedPoints);
        let receipt = &mut ctx.accounts.campaign_claim;
        receipt.profile = ctx.accounts.profile.key();
        receipt.owner = ctx.accounts.owner.key();
        receipt.claim_nonce = claim_nonce;
        receipt.amount_points = amount_points;
        receipt.claimed_at = Clock::get()?.unix_timestamp;
        ctx.accounts.profile.claimed_points = checked_add(ctx.accounts.profile.claimed_points, amount_points)?;
        ctx.accounts.profile.updated_at = receipt.claimed_at;
        Ok(())
    }
}

fn checked_add(left: u64, right: u64) -> Result<u64> {
    left.checked_add(right).ok_or(AuraError::Overflow.into())
}

#[derive(Accounts)]
pub struct InitializeProtocol<'info> {
    #[account(init, payer = authority, space = 8 + Protocol::INIT_SPACE, seeds = [b"protocol"], bump)]
    pub protocol: Account<'info, Protocol>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetProtocolPaused<'info> {
    #[account(mut, seeds = [b"protocol"], bump, has_one = authority)]
    pub protocol: Account<'info, Protocol>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct RegisterOperator<'info> {
    #[account(seeds = [b"protocol"], bump)]
    pub protocol: Account<'info, Protocol>,
    #[account(init, payer = authority, space = 8 + Operator::INIT_SPACE, seeds = [b"operator", authority.key().as_ref()], bump)]
    pub operator: Account<'info, Operator>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(network_id: u64)]
pub struct RegisterNetwork<'info> {
    #[account(mut, seeds = [b"protocol"], bump)]
    pub protocol: Account<'info, Protocol>,
    #[account(mut, has_one = authority)]
    pub operator: Account<'info, Operator>,
    #[account(init, payer = authority, space = 8 + Network::INIT_SPACE, seeds = [b"network", network_id.to_le_bytes().as_ref()], bump)]
    pub network: Account<'info, Network>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetNetworkState<'info> {
    #[account(seeds = [b"protocol"], bump, has_one = authority)]
    pub protocol: Account<'info, Protocol>,
    #[account(mut)]
    pub network: Account<'info, Network>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(epoch_number: u64)]
pub struct PublishRewardEpoch<'info> {
    #[account(seeds = [b"protocol"], bump, has_one = reward_authority)]
    pub protocol: Account<'info, Protocol>,
    #[account(init, payer = reward_authority, space = 8 + RewardEpoch::INIT_SPACE, seeds = [b"epoch", epoch_number.to_le_bytes().as_ref()], bump)]
    pub epoch: Account<'info, RewardEpoch>,
    #[account(mut)]
    pub reward_authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RecordNetworkRewardClaim<'info> {
    #[account(seeds = [b"protocol"], bump)]
    pub protocol: Account<'info, Protocol>,
    #[account(seeds = [b"epoch", epoch.epoch_number.to_le_bytes().as_ref()], bump)]
    pub epoch: Account<'info, RewardEpoch>,
    pub network: Account<'info, Network>,
    #[account(init, payer = claimer, space = 8 + ClaimReceipt::INIT_SPACE, seeds = [b"claim", epoch.key().as_ref(), network.key().as_ref(), claimer.key().as_ref()], bump)]
    pub claim_receipt: Account<'info, ClaimReceipt>,
    #[account(mut)]
    pub claimer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeCampaign<'info> {
    #[account(seeds = [b"protocol"], bump, has_one = authority)]
    pub protocol: Account<'info, Protocol>,
    #[account(init, payer = authority, space = 8 + Campaign::INIT_SPACE, seeds = [b"campaign"], bump)]
    pub campaign: Account<'info, Campaign>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateProfile<'info> {
    #[account(mut, seeds = [b"protocol"], bump)]
    pub protocol: Account<'info, Protocol>,
    #[account(mut, seeds = [b"campaign"], bump)]
    pub campaign: Account<'info, Campaign>,
    #[account(init, payer = owner, space = 8 + Profile::INIT_SPACE, seeds = [b"profile", owner.key().as_ref()], bump)]
    pub profile: Account<'info, Profile>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateProfileSocial<'info> {
    #[account(seeds = [b"protocol"], bump)]
    pub protocol: Account<'info, Protocol>,
    #[account(mut, has_one = owner)]
    pub profile: Account<'info, Profile>,
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(quest_hash: [u8; 32])]
pub struct CompleteQuest<'info> {
    #[account(mut, seeds = [b"protocol"], bump)]
    pub protocol: Account<'info, Protocol>,
    #[account(mut, seeds = [b"campaign"], bump)]
    pub campaign: Account<'info, Campaign>,
    #[account(mut, has_one = owner)]
    pub profile: Account<'info, Profile>,
    #[account(init, payer = owner, space = 8 + QuestReceipt::INIT_SPACE, seeds = [b"quest", profile.key().as_ref(), &quest_hash], bump)]
    pub quest_receipt: Account<'info, QuestReceipt>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(stake_nonce: u64)]
pub struct StakePoints<'info> {
    #[account(seeds = [b"protocol"], bump)]
    pub protocol: Account<'info, Protocol>,
    #[account(mut, seeds = [b"campaign"], bump)]
    pub campaign: Account<'info, Campaign>,
    #[account(mut, has_one = owner)]
    pub profile: Account<'info, Profile>,
    #[account(init, payer = owner, space = 8 + StakePosition::INIT_SPACE, seeds = [b"stake", profile.key().as_ref(), stake_nonce.to_le_bytes().as_ref()], bump)]
    pub stake_position: Account<'info, StakePosition>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(claim_nonce: u64)]
pub struct ClaimCampaignPoints<'info> {
    #[account(seeds = [b"protocol"], bump)]
    pub protocol: Account<'info, Protocol>,
    #[account(mut, has_one = owner)]
    pub profile: Account<'info, Profile>,
    #[account(init, payer = owner, space = 8 + CampaignClaim::INIT_SPACE, seeds = [b"campaign-claim", profile.key().as_ref(), claim_nonce.to_le_bytes().as_ref()], bump)]
    pub campaign_claim: Account<'info, CampaignClaim>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct Protocol {
    pub authority: Pubkey,
    pub reward_authority: Pubkey,
    pub fee_basis_points: u16,
    pub paused: bool,
    pub network_count: u64,
    pub profile_count: u64,
    pub total_campaign_points: u64,
}

#[account]
#[derive(InitSpace)]
pub struct Operator {
    pub authority: Pubkey,
    pub network_count: u64,
    pub status: OperatorStatus,
    pub created_at: i64,
}

#[account]
#[derive(InitSpace)]
pub struct Network {
    pub operator: Pubkey,
    pub network_id: u64,
    pub metadata_hash: [u8; 32],
    pub state: NetworkState,
    pub created_at: i64,
    pub updated_at: i64,
}

#[account]
#[derive(InitSpace)]
pub struct RewardEpoch {
    pub epoch_number: u64,
    pub merkle_root: [u8; 32],
    pub total_reward_units: u64,
    pub verified_session_count: u64,
    pub closed_at: i64,
    pub state: EpochState,
}

#[account]
#[derive(InitSpace)]
pub struct ClaimReceipt {
    pub epoch: Pubkey,
    pub network: Pubkey,
    pub claimer: Pubkey,
    pub amount_units: u64,
    pub claimed_at: i64,
}

#[account]
#[derive(InitSpace)]
pub struct Campaign {
    pub authority: Pubkey,
    pub reward_mint: Pubkey,
    pub total_profiles: u64,
    pub total_earned_points: u64,
    pub total_staked_points: u64,
    pub created_at: i64,
}

#[account]
#[derive(InitSpace)]
pub struct Profile {
    pub owner: Pubkey,
    #[max_len(32)]
    pub handle: String,
    pub wallet_ref_hash: [u8; 32],
    pub twitter_hash: [u8; 32],
    pub earned_points: u64,
    pub staked_points: u64,
    pub claimed_points: u64,
    pub quest_count: u64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[account]
#[derive(InitSpace)]
pub struct QuestReceipt {
    pub profile: Pubkey,
    pub quest_hash: [u8; 32],
    pub reward_points: u64,
    pub completed_at: i64,
}

#[account]
#[derive(InitSpace)]
pub struct StakePosition {
    pub profile: Pubkey,
    pub owner: Pubkey,
    pub stake_nonce: u64,
    pub amount_points: u64,
    pub locked_until: i64,
    pub created_at: i64,
}

#[account]
#[derive(InitSpace)]
pub struct CampaignClaim {
    pub profile: Pubkey,
    pub owner: Pubkey,
    pub claim_nonce: u64,
    pub amount_points: u64,
    pub claimed_at: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, PartialEq, Eq)]
pub enum NetworkState {
    Pending,
    Probation,
    Active,
    Degraded,
    Offline,
    Suspended,
    Revoked,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, PartialEq, Eq)]
pub enum EpochState {
    Published,
    Settled,
    Cancelled,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, PartialEq, Eq)]
pub enum OperatorStatus {
    Active,
    Suspended,
}

#[error_code]
pub enum AuraError {
    #[msg("Protocol is paused")]
    ProtocolPaused,
    #[msg("Fee basis points exceeds 100%")]
    InvalidFee,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Reward epoch is not published")]
    EpochNotPublished,
    #[msg("Claim amount must be greater than zero")]
    InvalidClaimAmount,
    #[msg("Profile handle must be 2-32 bytes")]
    InvalidHandle,
    #[msg("Quest reward is invalid")]
    InvalidReward,
    #[msg("Stake amount must be greater than zero")]
    InvalidStakeAmount,
    #[msg("Stake lock must be between 7 and 365 days")]
    InvalidLock,
    #[msg("Not enough unlocked campaign points")]
    InsufficientUnlockedPoints,
}
