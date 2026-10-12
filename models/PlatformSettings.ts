import mongoose, { Schema, Model } from "mongoose";

export interface IPlatformSettings {
  key: string;
  platform: {
    maintenanceMode: boolean;
    registrationEnabled: boolean;
    loginEnabled: boolean;
    emailVerificationRequired: boolean;
    defaultDisplayCurrency: string;
    defaultLanguage: string;
    timezone: string;
  };
  deposits: {
    enabled: boolean;
    minAmount: number;
    maxAmount: number;
    autoConfirm: boolean;
  };
  withdrawals: {
    enabled: boolean;
    minAmount: number;
    minGeneralWithdrawal: number;
    maxAmount: number;
    dailyLimit: number;
    requireEmailVerification: boolean;
    requireTwoFactor: boolean;
    manualReview: boolean;
    firstPackageWithdrawalPercent: number;
    referralPackageWithdrawalPercent: number;
  };
  trading: {
    enabled: boolean;
    spotEnabled: boolean;
    marginEnabled: boolean;
    futuresEnabled: boolean;
    defaultFeePercent: number;
    liquidationFeePercent: number;
    marginInterestRatePercent: number;
    minOrderAmount: number;
    maxOrderAmount: number;
  };
  referral: {
    enabled: boolean;
    commissionPercent: number;
    minPayout: number;
  };
  rewards: {
    enabled: boolean;
  };
  notifications: {
    enabled: boolean;
    emailEnabled: boolean;
  };
  support: {
    email: string;
    facebook: string;
    telegram: string;
  };
  security: {
    sessionDays: number;
    maxLoginAttempts: number;
    lockoutMinutes: number;
  };
}

const PlatformSettingsSchema = new Schema<IPlatformSettings>(
  {
    key: { type: String, unique: true, required: true, default: "global" },

    platform: {
      maintenanceMode: { type: Boolean, default: false },
      registrationEnabled: { type: Boolean, default: true },
      loginEnabled: { type: Boolean, default: true },
      emailVerificationRequired: { type: Boolean, default: true },
      defaultDisplayCurrency: { type: String, default: "USDT" },
      defaultLanguage: { type: String, default: "ar" },
      timezone: { type: String, default: "Africa/Cairo" },
    },

    deposits: {
      enabled: { type: Boolean, default: true },
      minAmount: { type: Number, default: 10 },
      maxAmount: { type: Number, default: 100000 },
      autoConfirm: { type: Boolean, default: false },
    },

    withdrawals: {
      enabled: { type: Boolean, default: true },
      minAmount: { type: Number, default: 50 },
      minGeneralWithdrawal: { type: Number, default: 50, min: 0 },
      maxAmount: { type: Number, default: 50000 },
      dailyLimit: { type: Number, default: 100000 },
      requireEmailVerification: { type: Boolean, default: true },
      requireTwoFactor: { type: Boolean, default: false },
      manualReview: { type: Boolean, default: true },
      firstPackageWithdrawalPercent: { type: Number, default: 100, min: 0, max: 100 },
      referralPackageWithdrawalPercent: { type: Number, default: 50, min: 0, max: 100 },
    },

    trading: {
      enabled: { type: Boolean, default: true },
      spotEnabled: { type: Boolean, default: true },
      marginEnabled: { type: Boolean, default: true },
      futuresEnabled: { type: Boolean, default: false },
      defaultFeePercent: { type: Number, default: 0.1 },
      liquidationFeePercent: { type: Number, default: 0.5, min: 0, max: 100 },
      marginInterestRatePercent: { type: Number, default: 0, min: 0, max: 100 },
      minOrderAmount: { type: Number, default: 10 },
      maxOrderAmount: { type: Number, default: 100000 },
    },

    referral: {
      enabled: { type: Boolean, default: true },
      commissionPercent: { type: Number, default: 10 },
      minPayout: { type: Number, default: 10 },
    },

    rewards: {
      enabled: { type: Boolean, default: true },
    },

    notifications: {
      enabled: { type: Boolean, default: true },
      emailEnabled: { type: Boolean, default: true },
    },

    support: {
      email: {
        type: String,
        default: "support@arabtrade.com",
      },
      facebook: {
        type: String,
        default: "https://facebook.com/ArabTrade",
      },
      telegram: {
        type: String,
        default: "https://t.me/ArabTrade",
      },
    },

    security: {
      sessionDays: { type: Number, default: 7 },
      maxLoginAttempts: { type: Number, default: 5 },
      lockoutMinutes: { type: Number, default: 15 },
    },
  },
  { timestamps: true }
);

const PlatformSettings: Model<IPlatformSettings> =
  mongoose.models.PlatformSettings ||
  mongoose.model<IPlatformSettings>(
    "PlatformSettings",
    PlatformSettingsSchema
  );

export default PlatformSettings;