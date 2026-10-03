/**
 * Real step recorders for the visualizer: each function actually runs the algorithm on the input and records
 * every comparison and swap as it happens. Nothing is scripted or pre-baked, so the animation is the execution.
 */
export interface Step {
    array: number[];
    compare: number[];
    swap: number[];
    sorted: number[];
    low?: number;
    high?: number;
    mid?: number;
    found?: number;
    note: string;
    comparisons: number;
    swaps: number;
}

export type AlgoId = 'binary' | 'linear' | 'bubble' | 'insertion' | 'selection' | 'merge' | 'quick';

export interface AlgoInfo {
    id: AlgoId;
    name: string;
    kind: 'search' | 'sort';
    best: string;
    average: string;
    worst: string;
    space: string;
    blurb: string;
    askAbout: string;
}

export const ALGOS: AlgoInfo[] = [
    { id: 'binary', name: 'Binary Search', kind: 'search', best: 'O(1)', average: 'O(log n)', worst: 'O(log n)', space: 'O(1)', blurb: 'Halves the search range every step. Needs a sorted array.', askAbout: 'Why does binary search need a sorted array?' },
    { id: 'linear', name: 'Linear Search', kind: 'search', best: 'O(1)', average: 'O(n)', worst: 'O(n)', space: 'O(1)', blurb: 'Checks every element in order. Works on any array.', askAbout: 'When is linear search better than binary search?' },
    { id: 'bubble', name: 'Bubble Sort', kind: 'sort', best: 'O(n)', average: 'O(n^2)', worst: 'O(n^2)', space: 'O(1)', blurb: 'Swaps neighbours that are out of order; the largest value bubbles to the end each pass.', askAbout: 'How does bubble sort work and why is it O(n^2)?' },
    { id: 'insertion', name: 'Insertion Sort', kind: 'sort', best: 'O(n)', average: 'O(n^2)', worst: 'O(n^2)', space: 'O(1)', blurb: 'Grows a sorted prefix by inserting each new element into place.', askAbout: 'When is insertion sort faster than other O(n^2) sorts?' },
    { id: 'selection', name: 'Selection Sort', kind: 'sort', best: 'O(n^2)', average: 'O(n^2)', worst: 'O(n^2)', space: 'O(1)', blurb: 'Repeatedly selects the smallest remaining value and puts it next.', askAbout: 'How does selection sort work?' },
    { id: 'merge', name: 'Merge Sort', kind: 'sort', best: 'O(n log n)', average: 'O(n log n)', worst: 'O(n log n)', space: 'O(n)', blurb: 'Splits the array, sorts each half, then merges the halves.', askAbout: 'Why is merge sort O(n log n)?' },
    { id: 'quick', name: 'Quick Sort', kind: 'sort', best: 'O(n log n)', average: 'O(n log n)', worst: 'O(n^2)', space: 'O(log n)', blurb: 'Partitions around a pivot, then sorts each side.', askAbout: 'Why is quick sort O(n^2) in the worst case?' },
];

class Recorder {
    steps: Step[] = [];
    comparisons = 0;
    swaps = 0;
    a: number[];
    constructor(a: number[]) {
        this.a = a;
    }
    push(note: string, extra: Partial<Step> = {}) {
        this.steps.push({ array: [...this.a], compare: [], swap: [], sorted: [], note, comparisons: this.comparisons, swaps: this.swaps, ...extra });
    }
}

export function recordBinarySearch(input: number[], target: number): Step[] {
    const a = [...input].sort((x, y) => x - y);
    const r = new Recorder(a);
    let lo = 0, hi = a.length - 1;
    r.push(`Searching for ${target} in the sorted array.`, { low: lo, high: hi });
    while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        r.comparisons++;
        r.push(`Middle is index ${mid} (value ${a[mid]}). Compare with ${target}.`, { low: lo, high: hi, mid, compare: [mid] });
        if (a[mid] === target) {
            r.push(`Found ${target} at index ${mid} after ${r.comparisons} comparison${r.comparisons > 1 ? 's' : ''}.`, { low: lo, high: hi, mid, found: mid });
            return r.steps;
        }
        if (a[mid] < target) {
            r.push(`${a[mid]} < ${target}: everything at or left of ${mid} is too small, so discard it.`, { low: lo, high: hi, mid, compare: [mid] });
            lo = mid + 1;
        } else {
            r.push(`${a[mid]} > ${target}: everything at or right of ${mid} is too big, so discard it.`, { low: lo, high: hi, mid, compare: [mid] });
            hi = mid - 1;
        }
        if (lo <= hi) r.push(`New range: indices ${lo} to ${hi}.`, { low: lo, high: hi });
    }
    r.push(`The range is empty: ${target} is not in the array (${r.comparisons} comparisons).`, {});
    return r.steps;
}

export function recordLinearSearch(input: number[], target: number): Step[] {
    const a = [...input];
    const r = new Recorder(a);
    r.push(`Searching for ${target}, from the left.`);
    for (let i = 0; i < a.length; i++) {
        r.comparisons++;
        r.push(`Check index ${i}: is ${a[i]} equal to ${target}?`, { compare: [i] });
        if (a[i] === target) {
            r.push(`Found ${target} at index ${i} after ${r.comparisons} comparison${r.comparisons > 1 ? 's' : ''}.`, { found: i });
            return r.steps;
        }
    }
    r.push(`Reached the end: ${target} is not in the array (${r.comparisons} comparisons).`);
    return r.steps;
}

export function recordBubbleSort(input: number[]): Step[] {
    const a = [...input];
    const r = new Recorder(a);
    const sorted: number[] = [];
    r.push('Start: compare neighbours and swap when out of order.');
    for (let pass = 0; pass < a.length - 1; pass++) {
        let swapped = false;
        for (let j = 0; j < a.length - 1 - pass; j++) {
            r.comparisons++;
            r.push(`Compare ${a[j]} and ${a[j + 1]}.`, { compare: [j, j + 1], sorted: [...sorted] });
            if (a[j] > a[j + 1]) {
                [a[j], a[j + 1]] = [a[j + 1], a[j]];
                r.swaps++;
                swapped = true;
                r.push(`${a[j + 1]} > ${a[j]}: swap them.`, { swap: [j, j + 1], sorted: [...sorted] });
            }
        }
        sorted.unshift(a.length - 1 - pass);
        r.push(`Pass ${pass + 1} done: ${a[a.length - 1 - pass]} is in its final place.`, { sorted: [...sorted] });
        if (!swapped) {
            r.push('No swaps in this pass, so the array is already sorted. Stop early.', { sorted: a.map((_, i) => i) });
            return r.steps;
        }
    }
    r.push('Sorted.', { sorted: a.map((_, i) => i) });
    return r.steps;
}

export function recordInsertionSort(input: number[]): Step[] {
    const a = [...input];
    const r = new Recorder(a);
    r.push('The first element alone is a sorted prefix.', { sorted: [0] });
    for (let i = 1; i < a.length; i++) {
        const key = a[i];
        let j = i - 1;
        r.push(`Take ${key} and insert it into the sorted prefix.`, { compare: [i], sorted: Array.from({ length: i }, (_, k) => k) });
        while (j >= 0) {
            r.comparisons++;
            r.push(`Is ${a[j]} greater than ${key}?`, { compare: [j, j + 1], sorted: Array.from({ length: i }, (_, k) => k) });
            if (a[j] <= key) break;
            a[j + 1] = a[j];
            r.swaps++;
            r.push(`Yes: shift ${a[j]} one place right.`, { swap: [j, j + 1] });
            j--;
        }
        a[j + 1] = key;
        r.push(`Place ${key} at index ${j + 1}.`, { sorted: Array.from({ length: i + 1 }, (_, k) => k) });
    }
    r.push('Sorted.', { sorted: a.map((_, i) => i) });
    return r.steps;
}

export function recordSelectionSort(input: number[]): Step[] {
    const a = [...input];
    const r = new Recorder(a);
    r.push('Find the smallest remaining value and move it to the front.');
    for (let i = 0; i < a.length - 1; i++) {
        let min = i;
        const done = Array.from({ length: i }, (_, k) => k);
        for (let j = i + 1; j < a.length; j++) {
            r.comparisons++;
            r.push(`Is ${a[j]} smaller than the current minimum ${a[min]}?`, { compare: [min, j], sorted: done });
            if (a[j] < a[min]) {
                min = j;
                r.push(`Yes: new minimum is ${a[min]} at index ${min}.`, { compare: [min], sorted: done });
            }
        }
        if (min !== i) {
            [a[i], a[min]] = [a[min], a[i]];
            r.swaps++;
            r.push(`Swap the minimum into index ${i}.`, { swap: [i, min], sorted: [...done, i] });
        } else {
            r.push(`${a[i]} is already the minimum: no swap.`, { sorted: [...done, i] });
        }
    }
    r.push('Sorted.', { sorted: a.map((_, i) => i) });
    return r.steps;
}

export function recordMergeSort(input: number[]): Step[] {
    const a = [...input];
    const r = new Recorder(a);
    r.push('Split in halves until single elements, then merge sorted halves.');
    const sortRange = (lo: number, hi: number) => {
        if (hi - lo < 1) return;
        const mid = Math.floor((lo + hi) / 2);
        sortRange(lo, mid);
        sortRange(mid + 1, hi);
        const left = a.slice(lo, mid + 1), right = a.slice(mid + 1, hi + 1);
        let i = 0, j = 0, k = lo;
        r.push(`Merge [${left.join(', ')}] and [${right.join(', ')}].`, { compare: Array.from({ length: hi - lo + 1 }, (_, x) => lo + x) });
        while (i < left.length && j < right.length) {
            r.comparisons++;
            const takeLeft = left[i] <= right[j];
            a[k] = takeLeft ? left[i++] : right[j++];
            r.swaps++;
            r.push(`Take the smaller front value, ${a[k]}, and write it to index ${k}.`, { swap: [k] });
            k++;
        }
        while (i < left.length) { a[k++] = left[i++]; r.swaps++; r.push(`Copy leftover ${a[k - 1]}.`, { swap: [k - 1] }); }
        while (j < right.length) { a[k++] = right[j++]; r.swaps++; r.push(`Copy leftover ${a[k - 1]}.`, { swap: [k - 1] }); }
    };
    sortRange(0, a.length - 1);
    r.push('Sorted.', { sorted: a.map((_, i) => i) });
    return r.steps;
}

export function recordQuickSort(input: number[]): Step[] {
    const a = [...input];
    const r = new Recorder(a);
    const placed = new Set<number>();
    r.push('Pick a pivot, put smaller values left and larger right, then recurse.');
    const sortRange = (lo: number, hi: number) => {
        if (lo > hi) return;
        if (lo === hi) { placed.add(lo); return; }
        const pivot = a[hi];
        r.push(`Pivot is ${pivot} (last element of indices ${lo}-${hi}).`, { compare: [hi], sorted: [...placed] });
        let i = lo;
        for (let j = lo; j < hi; j++) {
            r.comparisons++;
            r.push(`Is ${a[j]} less than the pivot ${pivot}?`, { compare: [j, hi], sorted: [...placed] });
            if (a[j] < pivot) {
                if (i !== j) { [a[i], a[j]] = [a[j], a[i]]; r.swaps++; r.push(`Yes: swap it into the left part (index ${i}).`, { swap: [i, j], sorted: [...placed] }); }
                i++;
            }
        }
        if (i !== hi) { [a[i], a[hi]] = [a[hi], a[i]]; r.swaps++; }
        placed.add(i);
        r.push(`Pivot ${pivot} lands at index ${i}: it is in its final place.`, { swap: [i], sorted: [...placed] });
        sortRange(lo, i - 1);
        sortRange(i + 1, hi);
    };
    sortRange(0, a.length - 1);
    r.push('Sorted.', { sorted: a.map((_, i) => i) });
    return r.steps;
}

export function record(id: AlgoId, input: number[], target: number): Step[] {
    switch (id) {
        case 'binary': return recordBinarySearch(input, target);
        case 'linear': return recordLinearSearch(input, target);
        case 'bubble': return recordBubbleSort(input);
        case 'insertion': return recordInsertionSort(input);
        case 'selection': return recordSelectionSort(input);
        case 'merge': return recordMergeSort(input);
        case 'quick': return recordQuickSort(input);
    }
}
