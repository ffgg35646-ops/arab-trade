import mongoose, { Model, Schema } from "mongoose";

interface IPackageCatalogSeed {
  key: string;
  status: "seeding" | "complete";
  seededAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const PackageCatalogSeedSchema = new Schema<IPackageCatalogSeed>(
  {
    key: { type: String, required: true, unique: true },
    status: { type: String, enum: ["seeding", "complete"], required: true, default: "seeding" },
    seededAt: { type: Date, default: null },
  },
  { timestamps: true },
);

const PackageCatalogSeed: Model<IPackageCatalogSeed> =
  (mongoose.models.PackageCatalogSeed as Model<IPackageCatalogSeed>) ||
  mongoose.model<IPackageCatalogSeed>("PackageCatalogSeed", PackageCatalogSeedSchema);

export default PackageCatalogSeed;
