import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Order } from 'entities/global.entity';
import { DataSource, Repository } from 'typeorm';

@Injectable()
export class DashboardService {
    constructor(private readonly dataSource: DataSource) { }
    async getOverview({ days = 30, points = 10 } = {}) {
        const entities = ['jobs', 'services'];

        const unionQueries: string[] = [];
        const values: any[] = [days, points]; // start positional parameters array
        let paramIndex = 3; // $1 = days, $2 = points

        entities.forEach((table, idx) => {
            // add table name as a value
            values.push(table);
            const tableParam = `$${paramIndex++}`;

            const query = `
            SELECT
                ${tableParam} AS entity,
                COUNT(e.id) AS count,
                s.seg_start,
                s.seg_end
            FROM (
                SELECT
                g.idx,
                (NOW() - make_interval(days => $1)) + (g.idx * (make_interval(days => $1) / $2)) AS seg_start,
                (NOW() - make_interval(days => $1)) + ((g.idx + 1) * (make_interval(days => $1) / $2)) AS seg_end
                FROM generate_series(0, $2 - 1) AS g(idx)
            ) s
            LEFT JOIN ${table} e
                ON e.created_at >= s.seg_start
                AND e.created_at < s.seg_end
            GROUP BY s.idx, s.seg_start, s.seg_end
            `;
            unionQueries.push(query);
        });

        const finalQuery = `
            ${unionQueries.join(' UNION ALL ')}
            ORDER BY seg_start ASC
        `;

        const result = await this.dataSource.query(finalQuery, values);

        // group by entity
        const grouped: Record<string, any[]> = {};
        result.forEach((row: any) => {
            if (!grouped[row.entity]) grouped[row.entity] = [];
            grouped[row.entity].push({
                count: parseInt(row.count, 10),
                seg_start: row.seg_start,
                seg_end: row.seg_end,
            });
        });

        return grouped;
    }


    async getCountsSummary(days: number = 30) {
        const tables = ['users', 'jobs', 'services', 'orders'];
        const queries: string[] = [];
        const values: any[] = [days]; // positional parameters


        tables.forEach((table, idx) => {

            // $1 = days
            queries.push(`
            SELECT 
                '${table}' AS entity,
                COUNT(*) AS total_count,
                COUNT(*) FILTER (WHERE created_at >= NOW() - make_interval(days => $1)) AS last_days_count
            FROM ${table}
            `);
        });


        const finalQuery = queries.join(' UNION ALL ');
        const result = await this.dataSource.query(finalQuery, values);

        // return object keyed by entity
        const summary: Record<string, { total_count: number; last_days_count: number }> = {};
        result.forEach((row: any) => {
            summary[row.entity] = {
                total_count: parseInt(row.total_count, 10),
                last_days_count: parseInt(row.last_days_count, 10),
            };
        });

        return summary;
    }


    async getCountsByStatus() {
        const tables = ['users', 'disputes', 'jobs', 'services'];
        const queries: string[] = [];

        tables.forEach((table) => {
            if (table === 'users') {
                // Special query for users because status is in the person table
                queries.push(`
                SELECT 
                    'users' AS entity, 
                    p.status::text AS status, 
                    COUNT(*)::int AS status_count
                FROM "users" u
                INNER JOIN "persons" p ON u."person_id" = p.id
                GROUP BY p.status
            `);
            } else {
                queries.push(`
                SELECT
                '${table}' AS entity,
                status::text AS status,
                COUNT(*) AS status_count
                FROM ${table}
                GROUP BY status
            `);
            }
        });

        const finalQuery = queries.join(' UNION ALL ');
        const result = await this.dataSource.query(finalQuery);

        // return object keyed by entity, each with an array of status/count objects
        const summary: Record<string, { status: string; status_count: number }[]> = {};

        result.forEach((row: any) => {
            if (!summary[row.entity]) summary[row.entity] = [];
            summary[row.entity].push({
                status: row.status,
                status_count: parseInt(row.status_count, 10),
            });
        });

        return summary;
    }


    async getRecentData() {
        const [orders, withdrawals] = await Promise.all([
            this.getLatestOrders(),
            this.getLatestWithdrawals(),
        ]);

        return {
            orders,
            withdrawals,
        };
    }

    private async getLatestOrders() {
        const orders = await this.dataSource.createQueryBuilder<Order>('orders', 'o')
            .leftJoinAndSelect('o.buyer', 'buyer')
            .leftJoinAndSelect('o.seller', 'seller')
            .leftJoinAndSelect('buyer.person', 'buyerPerson')
            .leftJoinAndSelect('seller.person', 'sellerPerson')
            .orderBy('o.created_at', 'DESC')
            .take(10)
            .getMany();


        return orders;
    }



    private async getLatestWithdrawals() {
        const qb = this.dataSource.createQueryBuilder('transactions', 't')
            .leftJoinAndSelect('t.user', 'user')
            .leftJoinAndSelect('user.person', 'person')
            .where('t.type = :type', { type: 'withdrawal' }) // filter withdrawals
            .orderBy('t.created_at', 'DESC')
            .take(10); // only latest 10


        const transactions = await qb.getMany();

        return transactions;
    }

}