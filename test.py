from openai import OpenAI
client = OpenAI(base_url="https://api-inference.bitdeer.ai/v1", api_key="mENnn6KoDkBJs01xlMbt")
 
resp = client.chat.completions.create(
    model="openai/gpt-oss-120b",
    messages=[
        {"role":"system","content":"You are a helpful assistant."},
        {"role":"user","content":"Say hi!"}
    ]
)
print(resp.choices[0].message.content)