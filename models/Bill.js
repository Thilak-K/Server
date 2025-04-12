const mongoose = require("mongoose");

const billSchema = new mongoose.Schema({
  customerId: {
    type: String,
    required: true,
    ref: "Customer",
  },
  items: [
    {
      itemId: {
        type: String,
        required: true,
        ref: "Billing",
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
  paidAmount: {
    type: Number,
    default: 0,
    min: 0,
  },
  balance: {
    type: Number,
    default: function () {
      return this.total - this.paidAmount;
    },
    default:0,
    
  },
  paymentStatus: {
    type: String,
    enum: ["Pending", "Partially Paid", "Paid"],
    default: "Pending",
  },
  date: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Bill", billSchema);