
1. Clone the repository
2. Set up Python environment:
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   pip install -e .
   ```

## env

create a .env file
```bash
# Image and Video Generation Tool
OPENAI_API_KEY=sk-ulvSPMqTx4xk71tnaX6akbXOd9x9cfE0JWVYjkR2kOjhBG9j
#OPENAI_AZURE_ENDPOINT=your_azure_endpoint
OPENAI_BASE_URL = https://agent.aigc369.com/v1
# Search Provider
#TAVILY_API_KEY=your_tavily_key
JINA_API_KEY=jina_e837d14f16d044188b7daff36f9734f4ULEZpoZSqoQ_v1em6RsDvIhN6Tye
#FIRECRAWL_API_KEY=your_firecrawl_key
# For Image Search and better search results use SerpAPI
#SERPAPI_API_KEY=your_serpapi_key 

STATIC_FILE_BASE_URL=http://localhost:8000/



R_MODEL=qwen3:30b]
R_TEMPERATURE=0.2
R_PRESENCE_PENALTY=0
R_REPORT_MODEL=qwen3:30b


COMPRESS_MAX_OUTPUT_WORDS=6500
COMPRESS_MAX_INPUT_WORDS=32000
COMPRESS_SIMILARITY_THRESHOLD=0.30
COMPRESS_EMBEDDING_MODEL=bge-large:latest
```

## Usage

### Command Line Interface


```bash
python cli.py 
```



### Web Interface


```bash
python ws_server_openai.py
```


