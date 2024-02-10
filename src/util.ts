const ITEMS_PER_PAGE = 100; // Adjust as required

export function uuidv4(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0,
            v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

export function getHistoryPage(page: number, callback: (results: chrome.history.HistoryItem[]) => void): void {
    if (!chrome.history) {
        console.error("Chrome History API is not available");
        return;
    }

    let endTime = Date.now(); // Default for first page
    let startTime = endTime - (ITEMS_PER_PAGE * 24 * 60 * 60 * 1000); // A rough estimate

    // If it's not the first page, adjust the endTime and startTime based on previous results
    if (page > 1) {
        chrome.history.search({
            text: '',
            startTime: 0,
            endTime: Date.now(),
            maxResults: (page - 1) * ITEMS_PER_PAGE
        }, (previousResults) => {
            const oldestItem = previousResults[previousResults.length - 1];
            if (!oldestItem.lastVisitTime) {
                return;
            }
            endTime = oldestItem.lastVisitTime;
            startTime = endTime - (ITEMS_PER_PAGE * 24 * 60 * 60 * 1000); // Adjust based on your needs

            fetchHistory(startTime, endTime, callback);
        });
    } else {
        fetchHistory(startTime, endTime, callback);
    }
}

function fetchHistory(startTime: number, endTime: number, callback: (results: chrome.history.HistoryItem[]) => void): void {
    chrome.history.search({
        text: '',
        startTime: startTime,
        endTime: endTime,
        maxResults: ITEMS_PER_PAGE
    }, (results) => {
        callback(results);
    });
}

export function downloadJson(jsonString: string, filename: string): void {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;

    document.body.appendChild(a);

    a.click();

    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export function getExtensionVersion(): string {
    const manifest = chrome.runtime.getManifest();
    return manifest.version;
}