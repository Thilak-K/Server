const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
  {
    customerId: {
      type: String,
      required: [true, "Customer ID is required"],
      unique: true,
      trim: true,
      match: [/^CUST-[A-Z]{3}-\d{2}\/\d{2}\/\d{4}-\d{4}$/, "Customer ID must follow the format CUST-XXX-dd/mm/yyyy-XXXX where XXX is 3 uppercase letters, dd/mm/yyyy is the date, and XXXX is 4 digits"],
    },
    name: {
      type: String,
      required: [true, "Customer name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters long"],
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    phonenumber: {
      type: String,
      required: [true, "Phone number is required"],
      unique: true,
      trim: true,
      match: [/^\+91-[6-9]\d{9}$/, "Phone number must be in +91XXXXXXXXXX format (without '-')"],
    },
    address: {
      type: String,
      required: [true, "Address is required"],
      trim: true,
      minlength: [5, "Address must be at least 5 characters long"],
      maxlength: [500, "Address cannot exceed 500 characters"],
    },
    town: {
      type: String,
      trim: true,
      minlength: [2, "Town must be at least 2 characters long"],
      maxlength: [100, "Town cannot exceed 100 characters"],
    },
    district: {
      type: String,
      default: "Dindigul",
      trim: true,
      maxlength: [100, "District cannot exceed 100 characters"],
    },
    state: {
      type: String,
      default: "Tamil Nadu",
      trim: true,
      maxlength: [100, "State cannot exceed 100 characters"],
    },
    maritalStatus: {
      type: String,
      default: "Married",
      trim: true,
      maxlength: [50, "Marital status cannot exceed 50 characters"],
    },
  },
  {
      timestamps: true,
      collection: "Customers", 
    
  }
);

module.exports = mongoose.model("Customer", customerSchema);
