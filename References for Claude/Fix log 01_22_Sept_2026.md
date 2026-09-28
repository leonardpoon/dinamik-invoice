# Global

1. the error message when creating new debit note "Some required fields still need filling in" should display after 5 seconds, not persistent 
2. 

## New Note Tab

###### General

1. rename new note to Create Debit Note



###### Parties

1. swap bill to and buyer's name as bill to will rarely be changed
2. Buyer's Name remove placeholder value



###### Note Identity

1. remove the ->DN202609-01 yellow beside the assign the next number automatically
2. change the assign the next number automatically rename to "Increment automatically"
3. Your invoice number, remove placeholder value
4. SI number and contract number are the same thing, but some buyers will use contract number instead of SI number. Need to model a way to change maybe a drop down box, or if it make sense, must have 1 filled and will use that filled field and ignore the empty fill
5. add P Number field beside Your Invoice No. and move the SI number to be beside the contract no. No need placeholder value and the user will input values for example 153/26, p number is 153 and 26 is the year



###### Cargo

1. remove the "Boxes convert to containers, containers to tonnage — as in the workbook" under the Cargo header
2. can remove the containers, not required in the final debit note generated



###### First Carrier

1. remove vessel name placeholder value
2. remove voyage number placeholder value
3. remove B/L number placeholder value
4. remove the B/L reference field



###### Outward Vessel

1. remove vessel name placeholder value
2. remove voyage number placeholder value



###### Charge

1. the total remove the = 75.60 x 54, only show the total
2. at the bottom, remove In Words. Leave the string 



###### Costing

1. remove the "From the rate card in Settings (17 lines)" below the header costing



###### Notifications

1. after creating a debit note successfully it should disappear after 5 seconds or when the user click out of the pop up notification



###### Using Saved Preset

1. contract number / si number shouldn't be copied 
2. invoice number, contract number / si number, P No., outward vessel name and voyage number should also be highlighted red

# Analytics

1. remove revenue, cost, profit card
2. remove revenue \& profit by month graph card
3. rename top buyers to buyers
4. rename tonnage by feeder vessel to tonnage by first carriers (30 days), the (30 days) should be greyed out and small font size
5. rename the first card, Tonnage to Total Metric Tonnes (30 days) and remove the debit note count 
6. beside tonnage metric tonnes card will be top buyer (30 days) and add the buyer total tonnage for the 30 day period, spans 2 card, for reference this page should be 3 card wide
7. next row add bar chart card for monthly tonnage (MT), span 2 card
8. beside it will be buyer list, showing how many contracts/si buyers have this month, bar chart with the buyer name on the y axis and amount in tonnage on the x axis 
9. next row will be tonnage by vessel first carrier, allow filtering by all time, periods, span 2 columns
10. beside tonnage by vessel first carrier card will be the different grade distribution
11. replace the by month card with recent debit notes, clickable and linkable to the relevant debit notes, show the latest 5



# PDF Formatting

1. I don't know where to start the formatting is wrong. Please check the sample excel sheet which contains the debit note form is done
2. debit note doesn't need the General Manager name and title at the bottom



# Filling

1. don't need user to click on the debit note for it to be included, can remove that option. Its a list in the register that will keep appending 
2. the generated file should be a table with the following columns that will be continuously appended as long there's relevant debit note: Debit Note No. | Date | P No. | B/L No. | Outward Vessel| filled (checked boxes)
3. remove anything that has to do with monetary value 
4. remove the counter of the filed 
5. the user should just be able to see the year, month for them to choose and preview and print the report generated
6. rename the "Filing Report" to "Filing Records"
7. remove the periods with data



# Cover Letter

1. remove the months to enclose, doesn't make sense to have multi months to send, they will only send once the month ends. Replace it with a navigation menu similar to history, year to month hierarchy 
2. add one more field which is the name, right now is a placeholder name
3. these 2 fields to be constant unless changed, that means even if the user restart, it will take the last used name and customer 
4. again ensure that the format follows the excel form that I added in the directory. I want everything to be the same, font, font size, horizontal lines, vertical lines etc
5. everything in the settings menu, company section can be transferred left hand side of the cover letter



# Settings

1. allow when the user click at the area outside of the setting to close the setting window

