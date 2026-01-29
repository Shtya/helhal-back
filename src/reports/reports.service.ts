import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import { Report, Order, Service, User, Transaction, UserBalance, OrderStatus, TransactionStatus } from 'entities/global.entity';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Report)
    private reportRepository: Repository<Report>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(Service)
    private serviceRepository: Repository<Service>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
    @InjectRepository(UserBalance)
    private userBalanceRepository: Repository<UserBalance>,
  ) { }

  async getSalesReport(userId: string, startDate: string, endDate: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    let orders: Order[];
    if (user.role === 'seller') {
      orders = await this.orderRepository.find({
        where: {
          sellerId: userId,
          status: In([OrderStatus.COMPLETED, OrderStatus.ACCEPTED, OrderStatus.DELIVERED]),
          orderDate: Between(start, end),
        }, relations: {
          buyer: {
            person: true // Fetches person details for the buyer
          },
          seller: {
            person: true // Fetches person details for the seller
          }
        }
      });
    } else {
      orders = await this.orderRepository.find({
        where: {
          buyerId: userId,
          orderDate: Between(start, end),
        },
        relations: {
          seller: {
            person: true, // Fetches profile details for the seller
          },
          service: true,
        }
      });
    }

    const totalSales = orders.reduce((sum, order) => sum + order.totalAmount, 0);
    const completedOrders = orders.filter(order => order.status === OrderStatus.COMPLETED).length;
    const cancelledOrders = orders.filter(order => order.status === OrderStatus.CANCELLED).length;

    return {
      period: { start, end },
      totalSales,
      totalOrders: orders.length,
      completedOrders,
      cancelledOrders,
      orders: orders.sort((a, b) => b.orderDate.getTime() - a.orderDate.getTime()),
    };
  }

  async getEarningsReport(userId: string, startDate: string, endDate: string) {
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const transactions = await this.transactionRepository.find({
      where: {
        userId,
        created_at: Between(start, end),
        status: TransactionStatus.COMPLETED,
      },
      order: { created_at: 'DESC' },
    });

    const earnings = transactions.filter(t => t.amount > 0);
    const expenses = transactions.filter(t => t.amount < 0);

    const totalEarnings = earnings.reduce((sum, t) => sum + t.amount, 0);
    const totalExpenses = expenses.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const netEarnings = totalEarnings - totalExpenses;

    return {
      period: { start, end },
      totalEarnings,
      totalExpenses,
      netEarnings,
      transactions,
      earningsByType: this.groupByType(earnings),
      expensesByType: this.groupByType(expenses),
    };
  }

  async getServicePerformanceReport(userId: string, serviceId?: string, startDate?: string, endDate?: string) {
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const whereClause: any = {
      sellerId: userId,
      created_at: Between(start, end),
    };

    if (serviceId) {
      whereClause.id = serviceId;
    }

    const services = await this.serviceRepository.find({
      where: whereClause,
      relations: ['orders', 'reviews'],
    });

    const report = services.map(service => {
      const periodOrders = service.orders.filter(order =>
        order.orderDate >= start && order.orderDate <= end
      );

      const completedOrders = periodOrders.filter(order => order.status === OrderStatus.COMPLETED);
      const cancelledOrders = periodOrders.filter(order => order.status === OrderStatus.CANCELLED);

      const revenue = completedOrders.reduce((sum, order) => sum + order.totalAmount, 0);
      const avgRating = service.reviews.length > 0
        ? service.reviews.reduce((sum, review) => sum + review.rating, 0) / service.reviews.length
        : 0;

      return {
        serviceId: service.id,
        serviceTitle: service.title,
        impressions: service.impressions,
        clicks: service.clicks,
        totalOrders: periodOrders.length,
        completedOrders: completedOrders.length,
        cancelledOrders: cancelledOrders.length,
        revenue,
        conversionRate: service.impressions > 0 ? (periodOrders.length / service.impressions) * 100 : 0,
        averageRating: avgRating,
        reviewCount: service.reviews.length,
      };
    });

    return {
      period: { start, end },
      services: report,
      summary: {
        totalServices: report.length,
        totalRevenue: report.reduce((sum, s) => sum + s.revenue, 0),
        totalOrders: report.reduce((sum, s) => sum + s.totalOrders, 0),
        averageConversionRate: report.reduce((sum, s) => sum + s.conversionRate, 0) / report.length,
      },
    };
  }

  async generateCustomReport(userId: string, reportConfig: any) {
    const { reportType, dateRange, filters, metrics } = reportConfig;

    // This would generate a comprehensive report based on the configuration
    // For now, we'll create a simple report record

    const report = this.reportRepository.create({
      userId,
      reportType,
      dateRange: JSON.stringify(dateRange),
      documentUrl: '', // Would be generated and stored
      serviceType: filters?.serviceType,
      orderRef: filters?.orderRef,
      currency: filters?.currency || 'USD',
      totalAmount: 0, // Would be calculated
    });

    const savedReport = await this.reportRepository.save(report);

    // In a real implementation, you would:
    // 1. Generate the report data based on the configuration
    // 2. Create a document (PDF, CSV, etc.)
    // 3. Store it and update the documentUrl
    // 4. Calculate and update the totalAmount

    return savedReport;
  }

  async getAdminSummaryReport(startDate: string, endDate: string) {
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    // Platform-wide statistics
    const totalUsers = await this.userRepository.count();
    const newUsers = await this.userRepository.count({
      where: { created_at: Between(start, end) },
    });

    const totalOrders = await this.orderRepository.count();
    const periodOrders = await this.orderRepository.count({
      where: { orderDate: Between(start, end) },
    });

    const completedOrders = await this.orderRepository.count({
      where: { status: OrderStatus.COMPLETED, orderDate: Between(start, end) },
    });

    const totalRevenue = await this.orderRepository
      .createQueryBuilder('order')
      .select('SUM(order.totalAmount)', 'total')
      .where('order.status = :status', { status: OrderStatus.COMPLETED })
      .andWhere('order.orderDate BETWEEN :start AND :end', { start, end })
      .getRawOne();

    const platformEarnings = await this.transactionRepository
      .createQueryBuilder('transaction')
      .select('SUM(transaction.amount)', 'total')
      .where('transaction.type = :type', { type: 'platform_fee' })
      .andWhere('transaction.created_at BETWEEN :start AND :end', { start, end })
      .getRawOne();

    return {
      period: { start, end },
      users: {
        total: totalUsers,
        new: newUsers,
      },
      orders: {
        total: totalOrders,
        period: periodOrders,
        completed: completedOrders,
        completionRate: periodOrders > 0 ? (completedOrders / periodOrders) * 100 : 0,
      },
      financials: {
        totalRevenue: parseFloat(totalRevenue.total) || 0,
        platformEarnings: parseFloat(platformEarnings.total) || 0,
      },
    };
  }

  async getUserActivityReport(userId?: string, startDate?: string, endDate?: string) {
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const whereClause: any = { created_at: Between(start, end) };
    if (userId) {
      whereClause.userId = userId;
    }

    const users = await this.userRepository.find({
      where: whereClause,
      relations: ['ordersAsBuyer', 'ordersAsSeller', 'services'],
    });

    const report = users.map(user => {
      const buyerOrders = user.ordersAsBuyer.filter(order => order.orderDate >= start && order.orderDate <= end);
      const sellerOrders = user.ordersAsSeller.filter(order => order.orderDate >= start && order.orderDate <= end);

      return {
        userId: user.id,
        username: user.username,
        role: user.role,
        joinDate: user.created_at,
        totalOrders: buyerOrders.length + sellerOrders.length,
        buyerOrders: buyerOrders.length,
        sellerOrders: sellerOrders.length,
        services: user.services.length,
        totalSpent: buyerOrders.reduce((sum, order) => sum + order.totalAmount, 0),
        totalEarned: sellerOrders.reduce((sum, order) => sum + order.totalAmount, 0),
        lastActivity: this.getLastActivity(user),
      };
    });

    return {
      period: { start, end },
      users: report.sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime()),
      summary: {
        totalUsers: report.length,
        totalActivity: report.reduce((sum, user) => sum + user.totalOrders, 0),
        totalRevenue: report.reduce((sum, user) => sum + user.totalEarned, 0),
      },
    };
  }

  private groupByType(transactions: Transaction[]): any {
    return transactions.reduce((acc, transaction) => {
      const type = transaction.type;
      acc[type] = (acc[type] || 0) + transaction.amount;
      return acc;
    }, {});
  }

  private getLastActivity(user: User): Date {
    const activities = [
      user.lastLogin,
      ...user.ordersAsBuyer.map(o => o.orderDate),
      ...user.ordersAsSeller.map(o => o.orderDate),
      ...user.services.map(s => s.created_at),
    ].filter(date => date !== null);

    return activities.length > 0
      ? new Date(Math.max(...activities.map(d => new Date(d).getTime())))
      : user.created_at;
  }
}