import * as React from "react";
import {useState, useEffect, useRef, useMemo} from "react";
import {Timeline as VisTimeline} from "vis-timeline/standalone";
import {historyDelete, historyGet} from "./shared";
import {Focus, History, Visit} from "@/gen/proto/history_pb";
import {Dashboard} from "@/Dashboard";

const randomHistory = () => {
    // make a history based on a list of domains and logically interesting start and end focus times. They should somewhat overlap
    const history = new History();
    const domains = ['google.com', 'facebook.com', 'twitter.com', 'news.ycombinator.com', 'reddit.com', 'github.com', 'youtube.com'];
    const now = new Date().getTime();
    for (let i = 0; i < 10; i++) {
        const visit = new Visit({
            url: `https://${domains[i % domains.length]}`,
            title: `Visit ${i}`,
            focus: [
                new Focus({
                    open: now - i * 60 * 1000 * 60,
                    close: now - i * 60 * 1000 * 60 + 60 * 1000 * 60,
                }),
                new Focus({
                    open: now - i * 60 * 1000 * 60 + 60 * 1000 * 60 * 2,
                    close: now - i * 60 * 1000 * 60 + 60 * 1000 * 60 * 3,
                }),
            ],
        });
        history.visits.push(visit);
    }
    return history;
}

const transformHistoryItems = (history: History): {
    items: any[];
    groups: any[];
} => {
    const groupsMap = new Map<string, number>();
    let groupId = 0;

    const timelineItems = history.visits.reduce((acc, item, index) => {
        // Extract domain from URL
        const url = new URL(item.url || "");
        const domain = url.hostname;

        // Assign or get groupId for the domain
        if (!groupsMap.has(domain)) {
            groupsMap.set(domain, groupId++);
        }
        const itemGroupId = groupsMap.get(domain);
        if (!itemGroupId) {
            return acc;
        }

        const base = {
            id: index,
            group: itemGroupId,
            content: item.title || item.url,
        };
        return [
            ...acc,
            ...item.focus.filter(i => i.close).map((focus, idx) => {
                return {
                    ...base,
                    start: new Date(focus.open),
                    end: new Date(focus.close),
                };
            })
        ]
    }, [] as {id: number, group: number, content: string, start: Date, end: Date}[]);

    // Creating group entries for vis-timeline
    // sort groups by the last access time
    const groupByDomain = Array.from(groupsMap.entries())
        .map(([domain, id]) => ({
            id: id,
            content: domain,
        }))
        .sort((a, b) => {
            const aItems = timelineItems.filter((item) => item.group === a.id);
            const bItems = timelineItems.filter((item) => item.group === b.id);
            const aLastVisitTime = Math.max(...aItems.map((item) => item.start.getTime()));
            const bLastVisitTime = Math.max(...bItems.map((item) => item.start.getTime()));
            return bLastVisitTime - aLastVisitTime;
        }).map((group, index) => {
            const aItems = timelineItems.filter((item) => item.group === group.id);
            return {
                id: group.id,
                content: group.content,
                start: Math.max(...aItems.map((item) => item.start.getTime())),
                group: 1,
            }
        });

    return { items: groupByDomain, groups: [
            { id: 1, content: 'Visits' },
            // { id: 2, content: 'Journeys' },
        ] };
};

export const BrowserHistory: React.FC = () => {
    const [domain, setDomain] = useState<string | undefined>(undefined);
    const [historyItems, setHistoryItems] = useState<chrome.history.HistoryItem[]>([]);
    const [content, setContent] = useState();
    const [browserHistory, setBrowserHistory] = useState<History|undefined>(undefined);
    const [lastNMinutes, setLastNMinutes] = useState(15);

    const loadBrowserHistory = async () => {
        const response = await chrome.runtime.sendMessage({ action: historyGet });
        if (response && response.data) {
            const h = History.fromJsonString(response.data);
            setBrowserHistory(h);
        }
    }

    const deleteHistory = async () => {
        await chrome.runtime.sendMessage({ action: historyDelete });
        setBrowserHistory(undefined);
    }

    useEffect(() => {
        void loadBrowserHistory();
    }, []);


    // sort by most resently visited
    const filteredItems = browserHistory?.visits.filter((item) => {
        if (!domain) {
            return true;
        }
        const url = new URL(item.url || "");
        return url.hostname === domain;
    }).sort((a, b) => {
        if (a.focus.length === 0) {
            return 1;
        }
        if (b.focus.length === 0) {
            return -1;
        }
        return b.focus[b.focus.length - 1].close - a.focus[a.focus.length - 1].close;
    });
    const timelineRef = useRef(null);

    useEffect(() => {
        if (timelineRef.current && browserHistory) {
            const d = transformHistoryItems(browserHistory);
            const timeline = new VisTimeline(timelineRef.current, d.items, d.groups, {
                height: '100%',
                // editable: true,
            });
            const endTime = new Date(new Date().getTime() + 60 * 1000); // current time
            const startTime = new Date(endTime.getTime() - 60 * lastNMinutes * 1000);
            timeline.setWindow(startTime, endTime, { animation: true });
            // timeline.fit();
            timeline.on('select', (props) => {
                setDomain(d.items.find(i => i.id === props.items[0]).content);
            });
            return () => {
                timeline.destroy();
            };
        }
    }, [browserHistory]);

    return (
        <div style={{height: '500px', width: '100%'}} className={"space-y-2"}>
            <div className={"navbar"}>
                <div className={"flex-1"}>
                    <a className={"btn btn-ghost text-xl"}>tabproblem</a>
                </div>
                <div className={"flex-none"}>
                    <ul className={"menu menu-horizontal px-1"}>
                        <li>
                            <button onClick={loadBrowserHistory}>reload</button>
                        </li>
                        <li>
                            <details>
                                <summary>
                                    actions
                                </summary>
                                <ul className="p-2 bg-base-100 rounded-t-none z-50">
                                    <li><a>export</a></li>
                                    <li><a>import</a></li>
                                    <li><a onClick={deleteHistory}>delete</a></li>
                                </ul>
                            </details>
                        </li>
                    </ul>
                </div>
            </div>
            <Dashboard history={browserHistory} />
            <div ref={timelineRef} style={{ width: '100%', height: '100%' }}/>
            <div className="mockup-browser border border-base-300">
                <div className="mockup-browser-toolbar">
                    {domain ? (
                        <div className="input border border-base-300">{domain}</div>
                    ) : (
                        <div className="input border border-base-300">what you have been up to</div>
                    )}
                </div>
                <table className={"table"}>
                    <thead>
                    <tr>
                        <th>Domain</th>
                        <th>URL</th>
                    </tr>
                    </thead>
                    <tbody>
                    {filteredItems && filteredItems.map((item) => {
                        const url = new URL(item.url || "");
                        return (
                            <tr key={item.id}>
                                <td>{url.hostname}</td>
                                <td><a href={item.url} target={"_blank"}>{item.url}</a></td>
                            </tr>
                        );
                    })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
