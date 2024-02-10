import React from 'react';
import { BarChart, Bar, Rectangle, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import {History} from "@/gen/proto/history_pb";

export const Dashboard: React.FC<{history: History|undefined}> = ({history}) => {
    // data for bar chart is a list of domains and how much time was spent on each, in hours
    const domainTime = history?.visits.reduce((acc, item) => {
        let domain = item.url;
        try {
            const url = new URL(item.url);
            domain = url.hostname;
        } catch (e) {}

        if (item.focus.length === 0) {
            return acc;
        }

        if (!acc[domain]) {
            acc[domain] = 0;
        }
        acc[domain] += item.focus.reduce((acc, focus) => {
            if (focus.close) {
                return acc + focus.close - focus.open;
            }
            return acc;
        }, 0);
        return acc;
    }, {} as Record<string, number>);
    console.log(domainTime)
    let domainTimeList = Object.entries(domainTime || {}).map(([domain, time]) => ({
        name: domain,
        time: time / 1000 / 60 / 60,
    }))
    // sort by time spent
    .sort((a, b) => b.time - a.time)
    .filter((item) => item.time > 0.001)
    // filter out newtab
    .filter((item) => item.name !== "newtab");

    return (
        <ResponsiveContainer width="100%" height="100%">
            <BarChart
                width={500}
                height={300}
                data={domainTimeList}
                margin={{
                    top: 5,
                    right: 30,
                    left: 20,
                    bottom: 5,
                }}
            >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis label={{ value: 'time (hours)', angle: -90, position: 'insideLeft' }}/>
                <Tooltip />
                <Legend />
                <Bar dataKey="time" fill="#8884d8" activeBar={<Rectangle fill="pink" stroke="blue" />} />
            </BarChart>
        </ResponsiveContainer>
    );
}
