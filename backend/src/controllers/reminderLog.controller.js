import ReminderLog from '../models/reminderLog.model.js';
import Medicine from '../models/medicine.model.js';

// Create a new reminder log
export const createReminderLog = async (req, res) => {
  try {
    const { medicineId, time, status, notes } = req.body;
    
    // Validate medicine belongs to user
    const medicine = await Medicine.findOne({
      _id: medicineId,
      userId: req.user._id
    });
    
    if (!medicine) {
      return res.status(404).json({
        success: false,
        message: 'Medicine not found or not authorized'
      });
    }
    
    // Create reminder log
    const reminderLog = new ReminderLog({
      userId: req.user._id,
      medicineId,
      time,
      status,
      notes
    });
    
    const savedLog = await reminderLog.save();
    
    res.status(201).json({
      success: true,
      message: 'Reminder log created successfully',
      data: savedLog
    });
  } catch (error) {
    console.error('Error creating reminder log:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: 'Validation Error',
        errors: messages
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error creating reminder log',
      error: error.message
    });
  }
};

// Log a medicine reminder (specific endpoint)
export const logMedicineReminder = async (req, res) => {
  try {
    const { medicineId, time, status } = req.body;
    
    // Check if medicine exists and belongs to the user
    const medicine = await Medicine.findOne({ 
      _id: medicineId,
      userId: req.user._id
    });
    
    if (!medicine) {
      return res.status(404).json({
        success: false,
        message: 'Medicine not found or you are not authorized to log reminders for it'
      });
    }
    
    // Validate status if provided, default to 'taken' if not provided
    const validStatus = status || 'taken';
    if (!['pending', 'taken', 'skipped', 'missed'].includes(validStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be pending, taken, skipped, or missed'
      });
    }
    
    // Validate time format if provided, use current time if not
    let validTime = time;
    if (!validTime) {
      const now = new Date();
      validTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    } else {
      const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(validTime)) {
        return res.status(400).json({
          success: false,
          message: 'Time must be in HH:MM format (24-hour)'
        });
      }
    }
    
    // Create and save the reminder log
    const reminderLog = new ReminderLog({
      userId: req.user._id,
      medicineId,
      time: validTime,
      status: validStatus,
      timestamp: new Date()
    });
    
    const savedLog = await reminderLog.save();
    
    // Return the created log
    res.status(201).json({
      success: true,
      message: `Medicine ${validStatus} successfully logged`,
      data: {
        id: savedLog._id,
        medicine: medicine.name,
        time: savedLog.time,
        status: savedLog.status,
        timestamp: savedLog.timestamp
      }
    });
  } catch (error) {
    console.error('Error logging medicine reminder:', error);
    
    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: 'Validation Error',
        errors: messages
      });
    }
    
    // Handle MongoDB ID errors
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid ID format'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error logging medicine reminder',
      error: error.message
    });
  }
};

// Get all reminder logs for the authenticated user
export const getReminderLogs = async (req, res) => {
  try {
    const { startDate, endDate, medicineId, status } = req.query;
    
    // Build query object
    const query = { userId: req.user._id };
    
    // Add date range filter if provided
    if (startDate && endDate) {
      query.timestamp = {
        $gte: new Date(startDate),
        $lte: new Date(`${endDate}T23:59:59.999Z`)
      };
    }
    
    // Add medicine filter if provided
    if (medicineId) {
      query.medicineId = medicineId;
    }
    
    // Add status filter if provided
    if (status) {
      query.status = status;
    }
    
    // Get pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Get total count for pagination
    const total = await ReminderLog.countDocuments(query);
    
    // Find reminder logs with filters, pagination and sorting
    const logs = await ReminderLog.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .populate('medicineId', 'name dosage frequency');
    
    res.status(200).json({
      success: true,
      count: logs.length,
      total,
      pagination: {
        page,
        pages: Math.ceil(total / limit),
        limit
      },
      data: logs
    });
  } catch (error) {
    console.error('Error fetching reminder logs:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching reminder logs',
      error: error.message
    });
  }
};

// Update a reminder log status
export const updateReminderLogStatus = async (req, res) => {
  try {
    const { status, notes } = req.body;
    
    if (!status || !['pending', 'taken', 'skipped', 'missed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Valid status is required (pending, taken, skipped, missed)'
      });
    }
    
    // Find the log and verify it belongs to the user
    const log = await ReminderLog.findOne({
      _id: req.params.id,
      userId: req.user._id
    });
    
    if (!log) {
      return res.status(404).json({
        success: false,
        message: 'Reminder log not found or not authorized'
      });
    }
    
    // Update the log
    log.status = status;
    if (notes !== undefined) {
      log.notes = notes;
    }
    
    const updatedLog = await log.save();
    
    res.status(200).json({
      success: true,
      message: 'Reminder log status updated successfully',
      data: updatedLog
    });
  } catch (error) {
    console.error('Error updating reminder log:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating reminder log',
      error: error.message
    });
  }
};

// Get statistics for the user's reminder logs
export const getReminderStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required'
      });
    }
    
    // Parse dates
    const start = new Date(startDate);
    const end = new Date(`${endDate}T23:59:59.999Z`);
    
    // Get statistics
    const stats = await ReminderLog.getSummaryStats(req.user._id, start, end);
    
    // Get medicine-specific stats
    const medicines = await Medicine.find({ userId: req.user._id });
    const medicineStats = await Promise.all(
      medicines.map(async (medicine) => {
        const logs = await ReminderLog.find({
          userId: req.user._id,
          medicineId: medicine._id,
          timestamp: { $gte: start, $lte: end }
        });
        
        const total = logs.length;
        const taken = logs.filter(log => log.status === 'taken').length;
        
        return {
          medicineId: medicine._id,
          name: medicine.name,
          total,
          taken,
          adherenceRate: total > 0 ? (taken / total) * 100 : 0
        };
      })
    );
    
    res.status(200).json({
      success: true,
      data: {
        overall: stats,
        byMedicine: medicineStats
      }
    });
  } catch (error) {
    console.error('Error getting reminder statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting reminder statistics',
      error: error.message
    });
  }
};

// Get reminder logs for the user (reminders endpoint)
export const getUserReminderLogs = async (req, res) => {
  try {
    const { medicineId, startDate, endDate, date, status, limit: limitStr, page: pageStr } = req.query;
    
    // Build query object
    const query = { userId: req.user._id };
    
    // Handle date filtering
    if (date) {
      // Single date filtering (e.g., ?date=2023-09-15)
      const startOfDay = new Date(date);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      
      query.timestamp = {
        $gte: startOfDay,
        $lte: endOfDay
      };
    } else if (startDate && endDate) {
      // Date range filtering (e.g., ?startDate=2023-09-01&endDate=2023-09-15)
      query.timestamp = {
        $gte: new Date(startDate),
        $lte: new Date(`${endDate}T23:59:59.999Z`)
      };
    }
    
    // Add medicine filter if provided
    if (medicineId) {
      query.medicineId = medicineId;
    }
    
    // Add status filter if provided
    if (status && ['pending', 'taken', 'skipped', 'missed'].includes(status)) {
      query.status = status;
    }
    
    // Pagination
    const page = parseInt(pageStr) || 1;
    const limit = parseInt(limitStr) || 20; // Higher default limit for this endpoint
    const skip = (page - 1) * limit;
    
    // Get total count for pagination
    const total = await ReminderLog.countDocuments(query);
    
    // Find reminder logs with filters, pagination and sorting
    const logs = await ReminderLog.find(query)
      .sort({ timestamp: -1 }) // Newest first
      .skip(skip)
      .limit(limit)
      .populate('medicineId', 'name dosage frequency');
    
    // Group logs by date
    const groupedLogs = logs.reduce((acc, log) => {
      const date = log.timestamp.toISOString().split('T')[0];
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(log);
      return acc;
    }, {});
    
    res.status(200).json({
      success: true,
      count: logs.length,
      total,
      pagination: {
        page,
        pages: Math.ceil(total / limit),
        limit
      },
      data: {
        logs,
        groupedByDate: groupedLogs
      }
    });
  } catch (error) {
    console.error('Error fetching reminder logs:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching reminder logs',
      error: error.message
    });
  }
};

// Export reminder logs for the user
export const exportReminderLogs = async (req, res) => {
  try {
    const { medicineId, dateFrom, dateTo, status } = req.query;
    
    // Build query object
    const query = { userId: req.user._id };
    
    // Add date range filter if provided
    if (dateFrom && dateTo) {
      query.timestamp = {
        $gte: new Date(dateFrom),
        $lte: new Date(`${dateTo}T23:59:59.999Z`)
      };
    }
    
    // Add medicine filter if provided
    if (medicineId) {
      query.medicineId = medicineId;
    }
    
    // Add status filter if provided
    if (status && ['pending', 'taken', 'skipped', 'missed'].includes(status)) {
      query.status = status;
    }
    
    // Get logs without pagination for export
    const logs = await ReminderLog.find(query)
      .sort({ timestamp: -1 })
      .populate('medicineId', 'name dosage frequency');
    
    // If no logs found, return an empty CSV with headers
    if (logs.length === 0) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=medication-logs-${new Date().toISOString().split('T')[0]}.csv`);
      return res.send('Date,Time,Medicine,Dosage,Status,Notes\r\n');
    }
    
    // Convert logs to CSV format
    const csvHeader = 'Date,Time,Medicine,Dosage,Status,Notes\r\n';
    const csvRows = logs.map(log => {
      const date = log.timestamp.toISOString().split('T')[0];
      const time = log.time || log.timestamp.toTimeString().split(' ')[0].substring(0, 5);
      const medicine = log.medicineId ? log.medicineId.name : 'Unknown';
      const dosage = log.medicineId ? log.medicineId.dosage : '';
      const status = log.status;
      const notes = log.notes ? `"${log.notes.replace(/"/g, '""')}"` : '';
      
      return `${date},${time},${medicine},${dosage},${status},${notes}`;
    }).join('\r\n');
    
    const csvContent = csvHeader + csvRows;
    
    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=medication-logs-${new Date().toISOString().split('T')[0]}.csv`);
    
    res.send(csvContent);
  } catch (error) {
    console.error('Error exporting reminder logs:', error);
    res.status(500).json({
      success: false,
      message: 'Error exporting reminder logs',
      error: error.message
    });
  }
};

// Get a single reminder log by ID
export const getReminderLogById = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find the log and verify it belongs to the user
    const log = await ReminderLog.findOne({
      _id: id,
      userId: req.user._id
    }).populate('medicineId', 'name dosage frequency');
    
    if (!log) {
      return res.status(404).json({
        success: false,
        message: 'Reminder log not found or not authorized'
      });
    }
    
    res.status(200).json({
      success: true,
      data: log
    });
  } catch (error) {
    console.error('Error fetching reminder log:', error);
    
    // Handle MongoDB ID errors
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid log ID format'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error fetching reminder log',
      error: error.message
    });
  }
}; 