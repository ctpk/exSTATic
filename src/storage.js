import { charsInLine, lineSplitCount } from "./calculations"

// One hour in milliseconds
var MAX_TIME_AWAY = 60 * 1000

// STORAGE SPEC
// {
//     "game_path": {
//         "name": "",
//         "dates_read_on": [],
//         "last_line_added": "id"
//     },
//     "game_path_date": {
//         "lines_read": 0,
//         "chars_read": 0,
//         "time_read": 0,
//         "last_line_recieved": ...
//     },
//     ["game_path", 0]: "line",
//     "previously_hooked": "game_path"
// }

export async function createGameEntry(process_path, line, date, time) {
    var game_entry = {}
    game_entry[process_path] = {
        "name": process_path,
        "dates_read_on": [date],
        "last_line_added": 0
    }
    game_entry[process_path + "_" + date] = await newDateEntry(process_path, line, time)
    game_entry[JSON.stringify([process_path, 0])] = line

    chrome.storage.local.set(game_entry)
}

async function newDateEntry(process_path, line, time) {
    return {
        "lines_read": lineSplitCount(line),
        "chars_read": charsInLine(line),
        "time_read": 0,
        "last_line_recieved": time
    }
}

export async function updatedGameEntry(game_entry, process_path, line, date, time) {
    // Update the main entry
    game_main_entry = game_entry[process_path]
    if (!game_main_entry["dates_read_on"].includes(date)) {
        game_main_entry["dates_read_on"].push(date)
    }
    game_main_entry["last_line_added"] += 1
    dates_read_on = structuredClone(game_main_entry["dates_read_on"])

    // Add the recieved line
    game_entry[JSON.stringify([process_path, game_main_entry["last_line_added"]])] = line

    // Update the daily statistics entry
    if ((process_path + "_" + date) in game_entry) {
        game_date_entry = game_entry[process_path + "_" + date]
        
        // The average/estimate is calculated first even though its added afterwards
        // Ensures only previous history effects current measures
        elapsed_time = time - game_date_entry["last_line_recieved"]

        average_char_speed = game_date_entry["chars_read"] / game_date_entry["time_read"]
        estimate_readtime = average_char_speed * charsInLine(line)

        // Don't add up excessively large readtimes
        // The time up to the max will be added by the injection script
        if (elapsed_time <= MAX_TIME_AWAY) {
            game_date_entry["time_read"] += elapsed_time
        }
        
        game_date_entry["lines_read"] += lineSplitCount(line)
        game_date_entry["chars_read"] += charsInLine(line)
        game_date_entry["last_line_recieved"] = time
    } else {
        game_entry[process_path + "_" + date] = await newDateEntry(process_path, line, time)
    }
    
    chrome.storage.local.set(game_entry)
}

export async function previousGameEntry() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get("previously_hooked", function(game_entry) {
            if (game_entry === undefined || game_entry["previously_hooked"] === undefined) {
                reject()
            }
            
            chrome.storage.local.get(game_entry["previously_hooked"], function(game_entry) {
                resolve(game_entry)
            })
        })
    })
}

export async function todayGameEntry() {
    rn = new Date()
    date = rn.getFullYear() + "/" + rn.getMonth() + "/" + rn.getDate()

    return new Promise((resolve, reject) => {
        chrome.storage.local.get("previously_hooked", function(game_entry) {
            if (game_entry === undefined || game_entry["previously_hooked"] === undefined) {
                reject()
            }
            
            chrome.storage.local.get(game_entry["previously_hooked"] + "_" + date, function(game_entry) {
                resolve(game_entry)
            })
        })
    })
}

export function safeDeleteLine(process_path, line_id, line) {
    line_key = JSON.stringify([process_path, line_id])
    chrome.storage.local.remove(line_key)

    chrome.storage.local.get(process_path, function(game_entry) {
        last_read_date = game_entry[process_path]["dates_read_on"].at(-1)
        game_date_key = process_path + "_" + last_read_date

        chrome.storage.local.get(game_date_key, function(game_entry) {
            game_entry[game_date_key]["lines_read"] -= lineSplitCount(line)
            game_entry[game_date_key]["chars_read"] -= charsInLine(line)

            chrome.storage.local.set(game_entry)
        })
    })
}
