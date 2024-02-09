/// <reference types="chrome"/>
import {History, Node, Edge} from "@/gen/proto/history_pb";
import {uuidv4} from "./util";
import {getItem, setItem} from "./storage";
import {historyDelete, historyGet} from "@/shared";

const historyKey = 'history';

let history: History|undefined = undefined;

const getHistory = async () => {
    if (history) {
        return history;
    }

    try {
        const storedHistory = await getItem(historyKey);
        if (storedHistory) {
            return History.fromJson(JSON.parse(storedHistory));
        }
    } catch (e) {
        console.warn('failed to load history from localstorage', e);
    }

    return new History();
}

const setHistory = async (h: History) => {
    void setItem(historyKey, h.toJsonString());
}

const tabs = new Map<number, {
    created: number;
    closed: number;
    tab: chrome.tabs.Tab;
    prev: chrome.tabs.Tab | undefined;
}>();

const chromeExt = () => {
    function getTabDetails(tabId: number): Promise<chrome.tabs.Tab | undefined> {
        return new Promise((resolve, reject) => {
            chrome.tabs.get(tabId, tab => {
                if (chrome.runtime.lastError) {
                    // Ignore errors, sometimes tabs might have already closed before we can fetch details
                    resolve(undefined);
                } else {
                    resolve(tab);
                }
            });
        });
    }

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        // TODO breadchris replace with a typed action
        if (message.action === historyGet) {
            (async () => {
                const history = await getHistory();
                sendResponse({ data: history.toJsonString(), status: true });
            })();
        }
        if (message.action === historyDelete) {
            (async () => {
                await setHistory(new History());
                sendResponse({ data: {}, status: true });
            })();
        }
        return true;
    });

    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
        if (!tabId) {
            return;
        }
        const tabDetails = await getTabDetails(tabId);
        if (tabDetails) {
            // console.log('onUpdated', tabId, changeInfo, tabDetails);
            const t = tabs.get(tabId);
            if (t) {
                tabs.set(tabId, {
                    ...t,
                    tab: tabDetails,
                    prev: t.tab
                });

                if (changeInfo.status === 'complete') {
                    console.log('onUpdated:complete', tabId, tabDetails.url, tabDetails);
                    const history = await getHistory();

                    if (tabDetails.url) {
                        const newNode = new Node({
                            id: uuidv4(),
                            url: tabDetails.url,
                            title: tabDetails.title || '',
                            open: Date.now(),
                            close: -1
                        });
                        const foundNode = history.nodes.find((n) => n.url === tabDetails.url);
                        if (!foundNode) {
                            history.nodes.push(newNode);
                        }
                        const n = foundNode || newNode;

                        const prevNode = history.nodes.find((n) => n.url === t?.prev?.url);
                        console.log("prev", prevNode, t);
                        if (prevNode) {
                            history.nodes[history.nodes.findIndex((n) => n.id === prevNode.id)] = new Node({
                                ...prevNode,
                                close: Date.now()
                            });
                            history.edges.push(new Edge({
                                from: prevNode.id,
                                to: n.id,
                                visitTime: Date.now(),
                                tab: tabId.toString()
                            }));
                        }
                    }
                    void setHistory(history);
                    // TODO breadchris deal with tabDetails.openerTabId
                }
            }
        }
    });

    chrome.tabs.onCreated.addListener(async (tab) => {
        if (!tab.id) {
            return;
        }
        const tabDetails = await getTabDetails(tab.id);
        if (tabDetails) {
            tabs.set(tab.id, {
                created: Date.now(),
                closed: -1,
                tab: tabDetails,
                prev: undefined
            });
        }
    })

    chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
        const t = tabs.get(tabId);
        if (t) {
            const newTab = {
                ...t,
                closed: Date.now()
            }
            tabs.set(tabId, newTab);
            console.log('tab was opened for', (newTab.closed - newTab.created) / 1000, 'seconds')
        }
    });
}

chromeExt();

export {};