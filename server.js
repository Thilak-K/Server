require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { cleanEnv, str, num } = require("envalid");
const Joi = require("joi");
const Customer = require("./models/Customers.js");
const Billing = require("./models/Billing.js");
const Bill = require("./models/Bill.js");

// Validate environment variables
const env = cleanEnv(process.env, {
  MONGO: str(),
  AWS_REGION: str(),
  KEY_ID: str(),
  ACCESS_KEY: str(),
  S3_BUCKET_NAME: str(),
  PORT: num({ default: 3000 }),
  ALLOWED_ORIGINS: str(),
  RATE_LIMIT_MAX: num({ default: 100 }),
});

// Initialize Express
const app = express();
app.set("trust proxy", 1);

// Middleware
app.use(helmet());
app.use(cors({ origin: env.ALLOWED_ORIGINS.split(",") }));
app.use(express.json());
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: env.RATE_LIMIT_MAX,
    message: { success: false, error: "Too many requests, please try again later" },
  })
);

// MongoDB Connection
mongoose
  .connect(env.MONGO)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => {
    console.error("❌ MongoDB Connection Error:", err);
    process.exit(1);
  });

// Helper function for sending errors
const sendError = (res, status, message) => {
  res.status(status).json({ success: false, error: message });
};

// Customer Schema Validation with Joi
const customerSchema = Joi.object({
  customerId: Joi.string()
    .pattern(/^CUST-[A-Z]{3}-\d{2}\/\d{2}\/\d{4}-\d{4}$/)
    .required()
    .messages({
      "string.pattern.base": "Customer ID must follow format CUST- followed by 12 alphanumeric characters",
    }),
  name: Joi.string().min(2).max(100).required(),
  phonenumber: Joi.string()
    .pattern(/^\+91-[6-9]\d{9}$/)
    .required()
    .messages({
      "string.pattern.base": "Phone number must be in +91XXXXXXXXXX format and start with 6-9",
    }),
  address: Joi.string().min(5).max(500).required(),
  town: Joi.string().min(2).max(100).allow("").optional(),
  district: Joi.string().max(100).default("Dindigul"),
  state: Joi.string().max(100).default("Tamil Nadu"),
  maritalStatus: Joi.string().max(50).default("Married"),
});

// Billing Schema Validation with Joi
const billingSchema = Joi.object({
  itemId: Joi.string()
    .pattern(/^ITEM-[A-Z0-9]{7}$/)
    .required()
    .messages({
      "string.pattern.base": "Item ID must follow format ITEM- followed by 7 alphanumeric characters",
    }),
  name: Joi.string().min(2).max(100).required(),
  price: Joi.number().min(0).required(),
});

// Bill Schema Validation with Joi
const billSchema = Joi.object({
  customerId: Joi.string()
    .pattern(/^CUST-[A-Z]{3}-\d{2}\/\d{2}\/\d{4}-\d{4}$/)
    .required(),
  items: Joi.array()
    .items(
      Joi.object({
        itemId: Joi.string()
          .pattern(/^ITEM-[A-Z0-9]{7}$/)
          .required(),
        quantity: Joi.number().min(1).required(),
      })
    )
    .min(1)
    .required(),
  total: Joi.number().min(0).required(),
  paidAmount: Joi.number().min(0).default(0),
  balance: Joi.number().optional(), // Allow positive or negative balance
  paymentStatus: Joi.string()
    .valid("Pending", "Partially Paid", "Paid")
    .default("Pending"),
});

// Customer Routes
app.post(`/customer/submitCustomers`, async (req, res, next) => {
  try {
    const { error } = customerSchema.validate(req.body);
    if (error) return sendError(res, 400, error.details[0].message);

    const { customerId, phonenumber } = req.body;

    const existingCustomer = await Customer.findOne({ customerId });
    if (existingCustomer) return sendError(res, 409, "Customer ID already exists");

    const existingPhone = await Customer.findOne({ phonenumber });
    if (existingPhone) return sendError(res, 409, "Phone number already exists");

    const newCustomer = new Customer(req.body);
    await newCustomer.save();

    res.status(201).json({
      success: true,
      message: "Customer saved successfully",
      customerId: newCustomer.customerId,
      createdAt: newCustomer.createdAt,
      updatedAt: newCustomer.updatedAt,
    });
  } catch (error) {
    if (error.name === "ValidationError") return sendError(res, 400, error.message);
    next(error);
  }
});

// Customer Get
app.get(`/customer/getCustomers`, async (req, res, next) => {
  try {
    const query = (req.query.q || "").toString().toLowerCase();
    let queryConditions = {};

    if (query) {
      queryConditions = {
        $or: [
          { name: { $regex: query, $options: "i" } },
          { phonenumber: { $regex: query, $options: "i" } },
        ],
      };
    }

    const customers = await Customer.find(queryConditions).sort({ name: 1 });
    res.status(200).json({
      success: true,
      customers,
      total: customers.length,
    });
  } catch (error) {
    next(error);
  }
});

// Customer Delete
app.delete(`/customer/deleteCustomer/:customerId`, async (req, res, next) => {
  try {
    const { customerId } = req.params;
    const deletedCustomer = await Customer.findOneAndDelete({ customerId });
    if (!deletedCustomer)
      return sendError(res, 404, "Customer not found");

    res.status(200).json({
      success: true,
      message: "Customer deleted successfully",
    });
  } catch (error) {
    next(error);
  }
});

// Customer Favorite
app.put(`/customer/toggleFavorite/:customerId`, async (req, res, next) => {
  try {
    const { customerId } = req.params;

    const customer = await Customer.findOne({ customerId });
    if (!customer) return sendError(res, 404, "Customer not found");

    // Toggle the favorite status
    customer.favorite = !customer.favorite;
    await customer.save();

    res.status(200).json({
      success: true,
      message: `Customer ${customer.favorite ? "added to" : "removed from"} favorites`,
      customerId: customer.customerId,
      favorite: customer.favorite,
    });
  } catch (error) {
    next(error);
  }
});

app.put(`/customer/updateCustomer/:customerId`, async (req, res, next) => {
  try {
    const { customerId } = req.params;
    const { name, phonenumber, address, town, district, state, maritalStatus } = req.body;

    const schema = Joi.object({
      name: Joi.string().min(2).max(100).required(),
      phonenumber: Joi.string().pattern(/^\+91-[6-9]\d{9}$/).required(),
      address: Joi.string().min(5).max(500).required(),
      town: Joi.string().min(2).max(100).allow("").optional(),
      district: Joi.string().max(100).default("Dindigul"),
      state: Joi.string().max(100).default("Tamil Nadu"),
      maritalStatus: Joi.string().max(50).default("Married"),
    });
    const { error } = schema.validate(req.body);
    if (error) return sendError(res, 400, error.details[0].message);

    const existingPhone = await Customer.findOne({
      phonenumber,
      customerId: { $ne: customerId },
    });
    if (existingPhone) return sendError(res, 409, "Phone number already exists");

    const updatedCustomer = await Customer.findOneAndUpdate(
      { customerId },
      { name, phonenumber, address, town, district, state, maritalStatus, updatedAt: Date.now() },
      { new: true, runValidators: true }
    );
    if (!updatedCustomer) return sendError(res, 404, "Customer not found");
    res.status(200).json({
      success: true,
      message: "Customer updated successfully",
      customer: updatedCustomer,
    });
  } catch (error) {
    next(error);
  }
});

// Billing Routes
app.post(`/billing/submitItems`, async (req, res, next) => {
  try {
    const { error } = billingSchema.validate(req.body);
    if (error) return sendError(res, 400, error.details[0].message);

    const { itemId } = req.body;

    const existingItem = await Billing.findOne({ itemId });
    if (existingItem) return sendError(res, 409, "Item ID already exists");

    const newItem = new Billing(req.body);
    await newItem.save();

    res.status(201).json({
      success: true,
      message: "Item saved successfully",
      itemId: newItem.itemId,
      createdAt: newItem.createdAt,
      updatedAt: newItem.updatedAt,
    });
  } catch (error) {
    if (error.name === "ValidationError") return sendError(res, 400, error.message);
    next(error);
  }
});

app.get(`/billing/getItems`, async (req, res, next) => {
  try {
    const items = await Billing.find().sort({ name: 1 });
    res.status(200).json({
      success: true,
      items,
      total: items.length,
    });
  } catch (error) {
    next(error);
  }
});

app.put(`/billing/updateItem`, async (req, res, next) => {
  try {
    const { error } = billingSchema.validate(req.body);
    if (error) return sendError(res, 400, error.details[0].message);

    const { itemId, name, price } = req.body;

    const updatedItem = await Billing.findOneAndUpdate(
      { itemId },
      { name, price },
      { new: true, runValidators: true }
    );

    if (!updatedItem) return sendError(res, 404, "Item not found");

    res.status(200).json({
      success: true,
      message: "Item updated successfully",
      item: updatedItem,
    });
  } catch (error) {
    if (error.name === "ValidationError") return sendError(res, 400, error.message);
    next(error);
  }
});

app.delete(`/billing/submitItems/:itemId`, async (req, res, next) => {
  try {
    const { itemId } = req.params;
    const deletedItem = await Billing.findOneAndDelete({ itemId });
    if (!deletedItem)
      return sendError(res, 404, "Item not found");
    res.status(200).json({
      success: true,
      message: "Item deleted successfully",
    });
  } catch (error) {
    next(error);
  }
});

// Bill Routes
app.post(`/bill/saveBill`, async (req, res, next) => {
  try {
    const { error } = billSchema.validate(req.body);
    if (error) return sendError(res, 400, error.details[0].message);

    const { customerId, items, total, paidAmount = 0 } = req.body;

    // Validate customer exists
    const customer = await Customer.findOne({ customerId });
    if (!customer) return sendError(res, 404, "Customer not found");

    // Validate itemIds exist
    const itemIds = items.map(item => item.itemId);
    const billingItems = await Billing.find({ itemId: { $in: itemIds } });
    const foundItemIds = new Set(billingItems.map(item => item.itemId));
    const invalidItems = itemIds.filter(id => !foundItemIds.has(id));
    if (invalidItems.length > 0) {
      return sendError(res, 400, `Invalid item IDs: ${invalidItems.join(', ')}`);
    }

    // Calculate balance and determine payment status
    const balance = total - paidAmount; // Allow positive or negative balance
    let paymentStatus = 'Pending';
    if (paidAmount >= total) {
      paymentStatus = 'Paid';
    } else if (paidAmount > 0) {
      paymentStatus = 'Partially Paid';
    }

    const newBill = new Bill({
      customerId,
      items,
      total,
      paidAmount,
      balance,
      paymentStatus,
    });
    await newBill.save();

    res.status(201).json({
      success: true,
      message: 'Bill saved successfully',
      billId: newBill._id,
    });
  } catch (error) {
    console.error('Error in /bill/saveBill:', error.message, error.stack);
    if (error.name === 'ValidationError') return sendError(res, 400, error.message);
    next(error);
  }
});

// Fetch Bills by Customer ID
app.get(`/bill/getBills/:customerId`, async (req, res, next) => {
  try {
    const { customerId } = req.params;

    // Validate customerId format
    const customerIdSchema = Joi.string()
      .pattern(/^CUST-[A-Z]{3}-\d{2}\/\d{2}\/\d{4}-\d{4}$/)
      .required();
    const { error } = customerIdSchema.validate(customerId);
    if (error) return sendError(res, 400, 'Invalid customer ID format');

    // Check if customer exists
    const customer = await Customer.findOne({ customerId });
    if (!customer) {
      return res.status(200).json({
        success: true,
        bills: [],
        total: 0,
        message: 'Customer not found',
      });
    }

    // Fetch bills
    const bills = await Bill.find({ customerId }).sort({ date: -1 });

    // Manually fetch item details
    const itemIds = [...new Set(bills.flatMap(bill => bill.items.map(item => item.itemId)))];
    const billingItems = await Billing.find({ itemId: { $in: itemIds } });
    const itemMap = new Map(billingItems.map(item => [item.itemId, item]));

    // Enrich bills with item details
    const enrichedBills = bills.map(bill => {
      const items = bill.items.map(item => {
        const billingItem = itemMap.get(item.itemId);
        return {
          ...item.toObject(),
          itemId: billingItem ? { itemId: billingItem.itemId, name: billingItem.name, price: billingItem.price } : null,
        };
      }).filter(item => item.itemId !== null); // Remove invalid items
      return {
        ...bill.toObject(),
        items,
      };
    });

    res.status(200).json({
      success: true,
      bills: enrichedBills,
      total: enrichedBills.length,
    });
  } catch (error) {
    console.error(`Error in /bill/getBills/${req.params.customerId}:`, error.message, error.stack);
    next(error);
  }
});

// Update Payment Details for a Bill
app.put('/bill/updatePayment/:billId', async (req, res, next) => {
  try {
    const { billId } = req.params;
    const { paidAmount } = req.body;

    // Validate paidAmount
    const paymentSchema = Joi.object({
      paidAmount: Joi.number().required(),
    });

    const { error } = paymentSchema.validate(req.body);
    if (error) return sendError(res, 400, error.details[0].message);

    const bill = await Bill.findById(billId);
    if (!bill) return sendError(res, 404, 'Bill not found');

    // Update fields
    bill.paidAmount = paidAmount;
    bill.balance = bill.total - paidAmount; // Positive if underpaid, negative if overpaid
    bill.paymentStatus =
      paidAmount >= bill.total ? 'Paid' : paidAmount > 0 ? 'Partially Paid' : 'Pending';

    await bill.save();

    res.status(200).json({
      success: true,
      message: 'Payment details updated successfully',
      bill,
    });
  } catch (error) {
    console.error('Update Payment Error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
    });
  }
});

app.get('/debug/billing/:itemId', async (req, res, next) => {
  try {
    const { itemId } = req.params;
    const item = await Billing.findOne({ itemId });
    res.json({
      success: true,
      item: item || null,
    });
  } catch (error) {
    console.error(`Error in /debug/billing/${req.params.itemId}:`, error.message, error.stack);
    res.json({
      success: false,
      error: error.message,
    });
  }
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(`❌ ${req.method} ${req.url} - Error: ${err.message}`, err.stack);
  res.status(500).json({ success: false, error: "Internal Server Error" });
});

// Start Server
const port = env.PORT;
const server = app.listen(port, () => console.log(`🚀 Server running on port ${port}`));

// Graceful Shutdown
process.on("SIGTERM", async () => {
  try {
    console.log("🛑 SIGTERM received. Shutting down gracefully...");
    await mongoose.connection.close();
    server.close(() => {
      console.log("✅ Server closed. Exiting process...");
      process.exit(0);
    });
  } catch (err) {
    console.error("❌ Error during shutdown:", err);
    process.exit(1);
  }
});