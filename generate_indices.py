import yfinance as yf
import pandas as pd
import json

def fetch_annual_returns(ticker_symbol):
    print(f"Fetching data for {ticker_symbol}...")
    ticker = yf.Ticker(ticker_symbol)
    
    # Pull maximum available historical daily data
    hist = ticker.history(period="max")
    
    if hist.empty:
        print(f"Warning: No data found for {ticker_symbol}.")
        return []

    # Resample the daily data to grab the closing price at the end of each year ('YE')
    annual_close = hist['Close'].resample('YE').last()
    
    # Calculate the percentage change from the previous year
    annual_returns = annual_close.pct_change().dropna()
    
    # Format the data into the JSON structure your simulator requires
    results = []
    for date, ret in annual_returns.items():
        results.append({
            "year": date.year,
            "return": round(float(ret), 4) # Round to 4 decimal places for clean JSON
        })
        
    return results

def main():
    # Mapping your system's index names to Yahoo Finance ticker symbols
    indices_map = {
    #    "SP500": "^GSPC",
    #    "EUROSTOXX50": "^STOXX50E"
         "OMXHEL": "^OMXHPI"
    }
    
    final_data = {}
    
    for name, symbol in indices_map.items():
        final_data[name] = fetch_annual_returns(symbol)
        print(f"Processed {len(final_data[name])} years of data for {name}.")
        
    # Write the output to your configuration file
    with open("indices_hex.json", "w") as f:
        json.dump(final_data, f, indent=2)
        
    print("\nSuccess! 'indices.json' has been generated and is ready for the backend.")

if __name__ == "__main__":
    main()
