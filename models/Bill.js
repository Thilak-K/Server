const mongoose = require("mongoose");

const billSchema = new mongoose.Schema({
  customerId: {
    type: String,
    required: true,
    ref: "Customer", // Reference to Customers collection
  },
  items: [
    {
      itemId: {
        type: String,
        required: true,
        ref: "Billing", // Reference to Billing collection
      },
      quantity: {
        type: Number,
        required: true,
        min: 1,
      },
    },
  ],
  total: {
    type: Number,
    required: true,
    min: 0,
  },
  date: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Bill", billSchema);