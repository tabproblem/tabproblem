/// <reference types="chrome"/>
import {History, Visit, Trip, Focus} from "@/gen/proto/history_pb";
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
            const t = tabs.get(tabId);
            if (t) {
                tabs.set(tabId, {
                    ...t,
                    tab: tabDetails,
                    prev: t.tab
                });

                if (changeInfo.status === 'complete') {
                    const history = await getHistory();

                    if (tabDetails.url) {
                        const newNode = new Visit({
                            id: uuidv4(),
                            url: tabDetails.url,
                            title: tabDetails.title || '',
                            tab: tabId.toString(),
                            focus: [
                                new Focus({
                                    open: Date.now(),
                                })
                            ]
                        });
                        const foundNode = history.visits.find((n) => n.url === tabDetails.url);
                        if (!foundNode) {
                            history.visits.push(newNode);
                        }
                        const n = foundNode || newNode;

                        const prevNode = history.visits.find((n) => n.url === t?.prev?.url);
                        if (prevNode) {
                            const visitIdx = history.visits.findIndex((n) => n.id === prevNode.id);
                            // update close on the last focus item
                            const newFocus = prevNode.focus.map((f, idx) => {
                                if (idx === prevNode.focus.length - 1) {
                                    return new Focus({
                                        ...f,
                                        close: Date.now(),
                                    });
                                }
                                return f;
                            })


                            history.visits[visitIdx] = new Visit({
                                ...prevNode,
                                focus: newFocus
                            });
                            history.trips.push(new Trip({
                                from: prevNode.id,
                                to: n.id,
                            }));
                        }
                    }
                    void setHistory(history);
                    // TODO breadchris deal with tabDetails.openerTabId
                }
            }
        }
    });

    chrome.windows.onFocusChanged.addListener(async (windowId) => {
        if (windowId === chrome.windows.WINDOW_ID_NONE) {
            return;
        }
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs.length === 1) {
            const tab = tabs[0];
            if (tab.id) {
                const tabDetails = await getTabDetails(tab.id);
                if (tabDetails) {
                    const history = await getHistory();
                    const foundNode = history.visits.find((n) => n.url === tabDetails.url);
                    if (foundNode) {
                        const visitIdx = history.visits.findIndex((n) => n.id === foundNode.id);
                        history.visits[visitIdx] = new Visit({
                            ...foundNode,
                            focus: [
                                ...history.visits[visitIdx].focus,
                                new Focus({
                                    open: Date.now(),
                                })
                            ]
                        });
                    }
                    void setHistory(history);
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